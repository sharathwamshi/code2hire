import io
import os
import secrets
import string
import threading
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, send_file, current_app

from extensions import db, bcrypt
from models import (
    User, JobDescription, Feedback, PrepFlow,
    InterviewConfig, InterviewSession, IntegrityEvent, SessionActionLog,
    InterviewReport, InterviewTurn, InterviewDraft, Notification, Setting,
)
from routes.utils import role_required
from services import anthropic_service
from services.resume_parser import extract_text_from_upload, UnsupportedResumeFormat
from flask_jwt_extended import get_jwt_identity
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem, HRFlowable,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _gen_password(length=10):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ---------------------------------------------------------------------------
# Job Descriptions
# ---------------------------------------------------------------------------

@admin_bp.get("/jds")
@role_required("admin")
def list_jds():
    jds = JobDescription.query.order_by(JobDescription.created_at.desc()).all()
    return jsonify([j.to_dict() for j in jds])


@admin_bp.post("/jds")
@role_required("admin")
def create_jd():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    company = (data.get("company") or "").strip() or None
    if not title or not content:
        return jsonify({"error": "title and content are required"}), 400

    jd = JobDescription(title=title, company=company, content=content)
    try:
        jd.key_points = anthropic_service.extract_jd_key_points(content)
    except Exception as exc:
        jd.key_points = []
        db.session.add(jd)
        db.session.commit()
        return jsonify({"jd": jd.to_dict(), "warning": f"Saved, but key-point extraction failed: {exc}"}), 201

    db.session.add(jd)
    db.session.commit()
    return jsonify({"jd": jd.to_dict()}), 201


@admin_bp.put("/jds/<int:jd_id>")
@role_required("admin")
def update_jd(jd_id):
    jd = JobDescription.query.get_or_404(jd_id)
    data = request.get_json(force=True) or {}
    content_changed = "content" in data and data["content"] != jd.content

    jd.title = data.get("title", jd.title)
    jd.company = data.get("company", jd.company)
    jd.content = data.get("content", jd.content)

    if content_changed:
        try:
            jd.key_points = anthropic_service.extract_jd_key_points(jd.content)
        except Exception:
            pass

    db.session.commit()
    return jsonify({"jd": jd.to_dict()})


@admin_bp.delete("/jds/<int:jd_id>")
@role_required("admin")
def delete_jd(jd_id):
    jd = JobDescription.query.get_or_404(jd_id)
    for u in jd.users:
        u.jd_id = None
    db.session.delete(jd)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ---------------------------------------------------------------------------
# Users (candidates)
# ---------------------------------------------------------------------------

@admin_bp.get("/users")
@role_required("admin")
def list_users():
    users = User.query.filter_by(role="candidate").order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users])


@admin_bp.get("/users/<int:user_id>")
@role_required("admin")
def get_user(user_id):
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict(include_resume=True))


@admin_bp.post("/users")
@role_required("admin")
def create_user():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username is required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 409

    password = data.get("password") or _gen_password()
    user = User(
        username=username,
        password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
        role="candidate", full_name=data.get("full_name"), email=data.get("email"),
        training_level=data.get("training_level", "medium"), jd_id=data.get("jd_id"),
        resume_text=data.get("resume_text"), must_change_password=True,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"user": user.to_dict(), "generated_password": password}), 201


@admin_bp.put("/users/<int:user_id>")
@role_required("admin")
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(force=True) or {}

    user.full_name = data.get("full_name", user.full_name)
    user.email = data.get("email", user.email)
    user.training_level = data.get("training_level", user.training_level)
    if data.get("active_stage") in ("prepare", "interview"):
        user.active_stage = data["active_stage"]
    if "jd_id" in data:
        user.jd_id = data["jd_id"] or None
    if data.get("resume_text") is not None:
        user.resume_text = data["resume_text"]
    if data.get("reset_password"):
        new_pw = data.get("new_password") or _gen_password()
        user.password_hash = bcrypt.generate_password_hash(new_pw).decode("utf-8")
        user.must_change_password = True
        db.session.commit()
        return jsonify({"user": user.to_dict(), "generated_password": new_pw})

    db.session.commit()
    return jsonify({"user": user.to_dict()})


@admin_bp.delete("/users/<int:user_id>")
@role_required("admin")
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "deleted"})


@admin_bp.post("/users/<int:user_id>/resume")
@role_required("admin")
def upload_resume_for_user(user_id):
    user = User.query.get_or_404(user_id)
    if "file" in request.files:
        f = request.files["file"]
        try:
            text, filename = extract_text_from_upload(f)
        except UnsupportedResumeFormat as exc:
            return jsonify({"error": str(exc)}), 400
        user.resume_filename = filename
        user.resume_text = text
    else:
        data = request.get_json(force=True) or {}
        user.resume_text = data.get("resume_text", user.resume_text)
        user.resume_filename = data.get("filename", user.resume_filename)
    user.resume_updated_text = None
    db.session.commit()
    return jsonify({"user": user.to_dict(include_resume=True)})


@admin_bp.get("/users/<int:user_id>/performance")
@role_required("admin")
def user_performance(user_id):
    user = User.query.get_or_404(user_id)
    feedbacks = Feedback.query.filter_by(user_id=user_id).order_by(Feedback.created_at.desc()).all()
    prep_count = PrepFlow.query.filter_by(user_id=user_id).count()
    return jsonify({
        "login_count": user.login_count, "total_time_seconds": user.total_time_seconds,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "avg_self_rating": user.avg_rating(), "feedback": [f.to_dict() for f in feedbacks],
        "prep_flows_generated": prep_count,
    })


@admin_bp.post("/users/<int:user_id>/resume/improve")
@role_required("admin")
def improve_user_resume(user_id):
    user = User.query.get_or_404(user_id)
    if not user.resume_text:
        return jsonify({"error": "This candidate has no resume on file yet"}), 400
    if not user.jd:
        return jsonify({"error": "This candidate has no JD assigned yet"}), 400
    try:
        improved = anthropic_service.improve_resume(user.resume_text, user.jd.content)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    user.resume_updated_text = improved
    user.resume_updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"resume_updated_text": improved})


@admin_bp.get("/users/<int:user_id>/resume/download")
@role_required("admin")
def download_updated_resume(user_id):
    user = User.query.get_or_404(user_id)
    content = user.resume_updated_text or user.resume_text
    if not content:
        return jsonify({"error": "No resume available"}), 404
    buf = io.BytesIO(content.encode("utf-8"))
    buf.seek(0)
    return send_file(buf, as_attachment=True, download_name=f"{user.username}_resume_updated.txt", mimetype="text/plain")


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@admin_bp.get("/settings")
@role_required("admin")
def get_settings():
    key = Setting.get("anthropic_api_key", "")
    masked = (key[:6] + "…" + key[-4:]) if len(key) > 12 else ("set" if key else "")

    azure_key = Setting.get("azure_speech_key", "")
    azure_masked = (azure_key[:6] + "…" + azure_key[-4:]) if len(azure_key) > 12 else ("set" if azure_key else "")

    return jsonify({
        "anthropic_api_key_set": bool(key), "anthropic_api_key_masked": masked,
        "anthropic_model": Setting.get("anthropic_model", "claude-sonnet-4-6"),
        "azure_speech_key_set": bool(azure_key), "azure_speech_key_masked": azure_masked,
        "azure_speech_region": Setting.get("azure_speech_region", ""),
    })


@admin_bp.post("/settings")
@role_required("admin")
def update_settings():
    data = request.get_json(force=True) or {}
    if data.get("anthropic_api_key"):
        Setting.set("anthropic_api_key", data["anthropic_api_key"].strip())
    if data.get("anthropic_model"):
        Setting.set("anthropic_model", data["anthropic_model"].strip())
    if data.get("azure_speech_key"):
        Setting.set("azure_speech_key", data["azure_speech_key"].strip())
    if data.get("azure_speech_region"):
        Setting.set("azure_speech_region", data["azure_speech_region"].strip())
    return jsonify({"message": "Settings updated"})


@admin_bp.post("/settings/clear-anthropic-key")
@role_required("admin")
def clear_anthropic_key():
    """Removes the database-stored Anthropic key/model overrides, so the app
    falls back to whatever is in the backend's .env file. Without this,
    a bad key saved once via Settings would silently override .env forever,
    even after fixing .env — this makes that recoverable from the UI."""
    Setting.delete("anthropic_api_key")
    Setting.delete("anthropic_model")
    return jsonify({"message": "Cleared. Now using the .env file's ANTHROPIC_API_KEY, if any."})


@admin_bp.post("/settings/test-anthropic")
@role_required("admin")
def test_anthropic():
    """Makes one minimal live call to Anthropic with whatever key/model is
    currently active, so key/model problems surface immediately and clearly
    instead of only during a real interview."""
    try:
        raw = anthropic_service._messages_create(
            system="Respond with exactly one word.",
            user_content="Say OK.",
            max_tokens=10,
        )
        return jsonify({"ok": True, "model": anthropic_service.get_active_model(), "sample_response": raw.strip()})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 200


@admin_bp.get("/settings/azure-voices")
@role_required("admin")
def get_azure_voices():
    from services.azure_speech_service import AVAILABLE_VOICES
    return jsonify(AVAILABLE_VOICES)


@admin_bp.get("/overview")
@role_required("admin")
def overview():
    total_candidates = User.query.filter_by(role="candidate").count()
    total_jds = JobDescription.query.count()
    total_logins = db.session.query(db.func.sum(User.login_count)).scalar() or 0
    total_time = db.session.query(db.func.sum(User.total_time_seconds)).scalar() or 0
    return jsonify({
        "total_candidates": total_candidates, "total_jds": total_jds,
        "total_logins": int(total_logins), "total_time_seconds": int(total_time),
    })


# ===========================================================================
# INTERVIEW MODULE — configuration, sessions dashboard, notifications
# ===========================================================================

@admin_bp.get("/users/<int:user_id>/interview-config")
@role_required("admin")
def get_interview_config(user_id):
    User.query.get_or_404(user_id)
    config = InterviewConfig.query.filter_by(user_id=user_id).first()
    return jsonify(config.to_dict() if config else None)


@admin_bp.post("/users/<int:user_id>/interview-config")
@role_required("admin")
def upsert_interview_config(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(force=True) or {}

    config = InterviewConfig.query.filter_by(user_id=user_id).first()
    if not config:
        config = InterviewConfig(user_id=user_id)
        db.session.add(config)

    config.mode = data.get("mode", config.mode or "ai")
    config.difficulty = data.get("difficulty", config.difficulty or "medium")
    config.voice_enabled = data.get("voice_enabled", config.voice_enabled if config.voice_enabled is not None else True)
    config.voice_id = data.get("voice_id", config.voice_id)
    config.max_questions = data.get("max_questions", config.max_questions or 12)
    config.skill_tags = data.get("skill_tags", config.skill_tags or [])
    config.violation_threshold = data.get("violation_threshold", config.violation_threshold or 1)
    config.require_fullscreen = data.get("require_fullscreen", config.require_fullscreen if config.require_fullscreen is not None else True)
    config.interviewer_name = data.get("interviewer_name", config.interviewer_name)

    if data.get("generate_link"):
        config.link_token = InterviewConfig.generate_token()
        config.link_expires_at = datetime.utcnow() + timedelta(days=data.get("link_valid_days", 3))

    db.session.commit()
    return jsonify(config.to_dict())


@admin_bp.post("/users/<int:user_id>/interview-attempts/reopen")
@role_required("admin")
def reopen_interview_attempt(user_id):
    """Grants exactly one more completed-interview attempt. The candidate cannot self-serve
    this - /start refuses once they've used up `attempts_allowed`, and the only way past that
    is an admin incrementing it here."""
    User.query.get_or_404(user_id)
    config = InterviewConfig.query.filter_by(user_id=user_id).first()
    if not config:
        return jsonify({"error": "No interview has been configured for this candidate yet."}), 400
    config.attempts_allowed = (config.attempts_allowed or 1) + 1
    db.session.commit()
    return jsonify(config.to_dict())


@admin_bp.get("/interview-sessions")
@role_required("admin")
def list_interview_sessions():
    status = request.args.get("status")
    q = InterviewSession.query
    if status:
        q = q.filter_by(status=status)
    sessions = q.order_by(InterviewSession.created_at.desc()).limit(200).all()
    return jsonify([s.to_dict() for s in sessions])


@admin_bp.get("/users/<int:user_id>/interview-history")
@role_required("admin")
def user_interview_history(user_id):
    """Every interview this candidate has taken (newest first), with the headline of
    its report when one has been generated."""
    User.query.get_or_404(user_id)
    sessions = (
        InterviewSession.query
        .filter(InterviewSession.user_id == user_id, InterviewSession.status.notin_(["not_started", "restarted"]))
        .order_by(InterviewSession.created_at.desc()).all()
    )
    rows = []
    for s in sessions:
        row = s.to_dict()
        row["answered_count"] = s.answered_count()
        row["planned_count"] = s.planned_count() if s.mode == "ai" else None
        r = s.report
        row["report"] = {
            "overall_score": r.overall_score, "verdict": r.verdict, "recommendation": r.recommendation,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "shared_with_candidate": bool(r.shared_with_candidate),
        } if r else None
        rows.append(row)
    return jsonify(rows)


@admin_bp.get("/interview-sessions/<int:session_id>")
@role_required("admin")
def get_interview_session(session_id):
    session = InterviewSession.query.get_or_404(session_id)
    data = session.to_dict(include_turns=True)
    if session.report:
        data["report"] = session.report.to_dict()
    return jsonify(data)


@admin_bp.post("/interview-sessions/<int:session_id>/resume")
@role_required("admin")
def resume_interview_session(session_id):
    """Admin-only resume: candidate cannot self-resume after a violation pause.
    Wrapped defensively so any unexpected error still returns clean JSON
    detail instead of an opaque HTML error page."""
    try:
        session = InterviewSession.query.get_or_404(session_id)
        if session.status != "paused":
            return jsonify({"error": f"Session is '{session.status}', not paused — nothing to resume."}), 400

        admin_id = int(get_jwt_identity())
        data = request.get_json(silent=True) or {}
        session.status = "in_progress"
        session.paused_at = None
        session.pause_reason = None
        db.session.add(SessionActionLog(session_id=session.id, action="resume", actor_admin_id=admin_id, note=data.get("note")))
        db.session.commit()
        return jsonify(session.to_dict())
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Unexpected error while resuming: {exc}"}), 500


@admin_bp.post("/interview-sessions/<int:session_id>/restart")
@role_required("admin")
def restart_interview_session(session_id):
    """Admin-only restart: discards current Q&A/transcript, starts a fresh run."""
    try:
        session = InterviewSession.query.get_or_404(session_id)
        admin_id = int(get_jwt_identity())
        data = request.get_json(silent=True) or {}

        InterviewTurn.query.filter_by(session_id=session.id).delete()
        # The old report was written from the transcript being discarded; keeping it would
        # show stale results in the history and block a fresh one being generated.
        InterviewReport.query.filter_by(session_id=session.id).delete()
        session.status = "not_started"
        session.pause_reason = None
        session.end_reason = None
        session.current_seq = 0
        session.question_count = 0
        session.draft_step = 0
        session.started_at = None
        session.paused_at = None
        session.completed_at = None
        db.session.add(SessionActionLog(session_id=session.id, action="restart", actor_admin_id=admin_id, note=data.get("note")))
        db.session.commit()
        return jsonify(session.to_dict())
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Unexpected error while restarting: {exc}"}), 500


@admin_bp.post("/interview-sessions/<int:session_id>/manual-pause")
@role_required("admin")
def manual_pause_interview_session(session_id):
    """Admin can pause a live interview themselves, even without a violation."""
    try:
        session = InterviewSession.query.get_or_404(session_id)
        if session.status != "in_progress":
            return jsonify({"error": f"Session is '{session.status}', cannot pause."}), 400

        admin_id = int(get_jwt_identity())
        data = request.get_json(silent=True) or {}
        session.status = "paused"
        session.paused_at = datetime.utcnow()
        db.session.add(SessionActionLog(session_id=session.id, action="manual_pause", actor_admin_id=admin_id, note=data.get("note")))
        db.session.commit()
        return jsonify(session.to_dict())
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Unexpected error while pausing: {exc}"}), 500


@admin_bp.get("/notifications")
@role_required("admin")
def list_notifications():
    unread_only = request.args.get("unread") == "1"
    q = Notification.query
    if unread_only:
        q = q.filter_by(is_read=False)
    notes = q.order_by(Notification.created_at.desc()).limit(50).all()
    return jsonify([n.to_dict() for n in notes])


@admin_bp.post("/notifications/<int:notification_id>/read")
@role_required("admin")
def mark_notification_read(notification_id):
    note = Notification.query.get_or_404(notification_id)
    note.is_read = True
    db.session.commit()
    return jsonify(note.to_dict())


@admin_bp.post("/notifications/read-all")
@role_required("admin")
def mark_all_notifications_read():
    Notification.query.filter_by(is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "ok"})


@admin_bp.post("/interview-sessions/<int:session_id>/generate-report")
@role_required("admin")
def generate_session_report(session_id):
    """Generates the AI evaluation report for a session. For live human
    interviews, since real-time transcription isn't wired to an ASR provider
    in this build, the admin can paste the call transcript here."""
    session = InterviewSession.query.get_or_404(session_id)
    data = request.get_json(force=True) or {}
    transcript_text = data.get("transcript_text")

    if transcript_text:
        InterviewTurn.query.filter_by(session_id=session.id).delete()
        seq = 0
        for line in transcript_text.splitlines():
            line = line.strip()
            if not line:
                continue
            seq += 1
            role = "ai"
            content = line
            if ":" in line:
                prefix, rest = line.split(":", 1)
                prefix_l = prefix.strip().lower()
                if prefix_l in ("candidate", "user", "interviewee"):
                    role = "candidate"
                elif prefix_l in ("ai", "interviewer", "ai interviewer"):
                    role = "ai"
                content = rest.strip() or line
            db.session.add(InterviewTurn(session_id=session.id, seq=seq, role=role, content=content))
        session.current_seq = seq
        db.session.commit()

    transcript = [{"role": t.role, "content": t.content, "topic": t.topic} for t in session.turns]
    if not transcript:
        return jsonify({"error": "No transcript available. Paste one in transcript_text, or ensure the session has turns."}), 400
    if not any(t["role"] == "candidate" for t in transcript):
        return jsonify({"error": "The candidate did not give any answers in this session, so there is nothing to report on."}), 400

    user = session.user
    try:
        report_data = anthropic_service.generate_interview_report(
            transcript=transcript, resume_text=user.resume_text or "",
            jd_content=session.jd.content, candidate_name=user.full_name or user.username,
            interview_note=session.completion_note(),
        )
    except Exception as exc:
        current_app.logger.exception("Report generation failed for session %s", session.id)
        return jsonify({"error": "Could not generate the evaluation report right now. Please try again in a moment."}), 502

    existing_report = InterviewReport.query.filter_by(session_id=session.id).first()
    if existing_report:
        db.session.delete(existing_report)
        db.session.flush()

    report = InterviewReport(
        session_id=session.id,
        overall_score=report_data.get("overall_score"),
        verdict=report_data.get("verdict"),
        recommendation=report_data.get("recommendation"),
        summary_json={
            "key_strengths": report_data.get("key_strengths", []),
            "technical_skills": report_data.get("technical_skills", []),
            "soft_skills": report_data.get("soft_skills", []),
            "areas_for_improvement": report_data.get("areas_for_improvement", []),
            "reason_for_selection": report_data.get("reason_for_selection", ""),
        },
        qna_json=report_data.get("qna", []),
    )
    db.session.add(report)
    if not session.completed_at:
        session.completed_at = datetime.utcnow()
        session.status = "completed"
    db.session.commit()
    return jsonify(report.to_dict())


@admin_bp.post("/interview-sessions/<int:session_id>/report/share")
@role_required("admin")
def share_report_with_candidate(session_id):
    """Turns the candidate's access to this session's report on or off. Off is the default
    for every report; a candidate sees nothing until an admin shares it here."""
    session = InterviewSession.query.get_or_404(session_id)
    report = session.report
    if not report:
        return jsonify({"error": "There is no report for this session yet, so there is nothing to share."}), 404

    data = request.get_json(silent=True) or {}
    shared = bool(data.get("shared", True))
    if shared != bool(report.shared_with_candidate):
        report.shared_with_candidate = shared
        report.shared_at = datetime.utcnow() if shared else None
        db.session.add(SessionActionLog(
            session_id=session.id, action="share_report" if shared else "unshare_report",
            actor_admin_id=int(get_jwt_identity()),
            note="Report shared with the candidate" if shared else "Report hidden from the candidate",
        ))
        db.session.commit()
    return jsonify(report.to_dict())


@admin_bp.get("/interview-sessions/<int:session_id>/report/pdf")
@role_required("admin")
def download_report_pdf(session_id):
    session = InterviewSession.query.get_or_404(session_id)
    report = InterviewReport.query.filter_by(session_id=session.id).first()
    if not report:
        return jsonify({"error": "No report has been generated for this session yet."}), 404

    user = session.user
    summary = report.summary_json or {}
    qna = report.qna_json or []
    candidate_name = user.full_name or user.username

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        title=f"Interview report - {candidate_name}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"], fontSize=20, spaceAfter=2)
    meta_style = ParagraphStyle("ReportMeta", parent=styles["Normal"], textColor=colors.HexColor("#5B5470"), fontSize=10, spaceAfter=14)
    h2 = ParagraphStyle("ReportH2", parent=styles["Heading2"], fontSize=12.5, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#2B1B54"))
    body = ParagraphStyle("ReportBody", parent=styles["Normal"], fontSize=10, leading=14)
    ref_style = ParagraphStyle("ReportRef", parent=body, textColor=colors.HexColor("#2E7D53"))
    q_style = ParagraphStyle("ReportQ", parent=body, fontSize=10.5, spaceBefore=8, spaceAfter=4, fontName="Helvetica-Bold")

    verdict_color = {
        "Selected": colors.HexColor("#2E7D53"),
        "Rejected": colors.HexColor("#A63A31"),
    }.get(report.recommendation, colors.HexColor("#6339B8"))

    story = [
        Paragraph(candidate_name, title_style),
        Paragraph(
            f"{session.jd.title} &middot; {'AI-conducted interview' if session.mode == 'ai' else 'Live interview'} &middot; "
            f"Generated {report.generated_at.strftime('%d %b %Y, %I:%M %p') if report.generated_at else ''}"
            + (f" &middot; Ended early ({session.answered_count()}"
               f"{' of ' + str(session.planned_count()) if session.planned_count() else ''} answered)"
               if session.end_reason == 'candidate_exit' else ''),
            meta_style,
        ),
    ]

    score_table = Table(
        [[
            Paragraph(f"<b>{report.overall_score}/5</b>", ParagraphStyle("Score", parent=body, fontSize=16)),
            Paragraph(f"<b>{report.recommendation or ''}</b>", ParagraphStyle("Rec", parent=body, fontSize=11, textColor=verdict_color)),
            Paragraph(report.verdict or "", ParagraphStyle("Verdict", parent=body, fontSize=11)),
        ]],
        colWidths=[1.4 * inch, 2.2 * inch, 2.2 * inch],
    )
    score_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story.append(score_table)
    story.append(HRFlowable(width="100%", color=colors.HexColor("#E6E1F3"), spaceAfter=10))

    def bullet_section(title_text, items):
        story.append(Paragraph(title_text, h2))
        if items:
            story.append(ListFlowable(
                [ListItem(Paragraph(item, body), bulletColor=colors.HexColor("#6339B8")) for item in items],
                bulletType="bullet", start="•", leftIndent=14,
            ))
        else:
            story.append(Paragraph("—", body))

    bullet_section("Key strengths", summary.get("key_strengths", []))
    bullet_section("Areas for improvement", summary.get("areas_for_improvement", []))
    bullet_section("Technical skills", summary.get("technical_skills", []))
    bullet_section("Soft skills", summary.get("soft_skills", []))

    if summary.get("reason_for_selection"):
        story.append(Paragraph("Overall assessment", h2))
        story.append(Paragraph(summary["reason_for_selection"], body))

    story.append(Paragraph(f"Questions &amp; answers ({len(qna)})", h2))
    for i, qa in enumerate(qna, 1):
        story.append(Paragraph(
            f"{i}. {qa.get('question', '')}  "
            f"<font size=8 color='#5B5470'>({qa.get('topic', '')} &middot; {qa.get('score_pct', 0)}%)</font>",
            q_style,
        ))
        story.append(Paragraph(f"<b>Candidate:</b> {qa.get('candidate_answer', '')}", body))
        story.append(Paragraph(f"<b>Reference:</b> {qa.get('reference_answer', '')}", ref_style))
        story.append(Spacer(1, 6))

    doc.build(story)
    buf.seek(0)

    filename = f"interview-report-{candidate_name.replace(' ', '-')}.pdf"
    return send_file(buf, mimetype="application/pdf", as_attachment=True, download_name=filename)


@admin_bp.get("/interview-sessions/<int:session_id>/recording")
@role_required("admin")
def download_recording(session_id):
    session = InterviewSession.query.get_or_404(session_id)
    if not session.recording_path or not os.path.exists(session.recording_path):
        return jsonify({"error": "No recording available for this session"}), 404
    return send_file(session.recording_path, as_attachment=True)


# ===========================================================================
# INTERVIEW QUESTION DRAFTS
#
# Pre-generate the full interview question set ahead of time so the admin
# can review/edit/approve it, instead of generating questions live while
# the candidate waits mid-interview.
# ===========================================================================

@admin_bp.post("/users/<int:user_id>/interview-draft/generate")
@role_required("admin")
def generate_interview_draft(user_id):
    user = User.query.get_or_404(user_id)
    if not user.jd:
        return jsonify({"error": "This candidate has no JD assigned yet."}), 400
    if not user.resume_text:
        return jsonify({"error": "This candidate has no resume on file yet."}), 400

    key_points = user.jd.key_points or []
    if not key_points:
        try:
            key_points = anthropic_service.extract_jd_key_points(user.jd.content)
            user.jd.key_points = key_points
            db.session.commit()
        except Exception as exc:
            return jsonify({"error": f"Could not analyze the job description: {exc}"}), 502
    if not key_points:
        return jsonify({"error": "Could not extract requirement points from this job description."}), 502

    draft = InterviewDraft(
        user_id=user.id, jd_id=user.jd_id, difficulty=user.training_level,
        status="generating", total_topics=len(key_points), questions_json=[],
    )
    db.session.add(draft)
    db.session.commit()

    app_obj = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_draft_generation,
        args=(app_obj, draft.id, user.resume_text, user.jd.content, key_points, user.training_level),
        daemon=True,
    )
    thread.start()

    return jsonify({"draft_id": draft.id, "total_topics": len(key_points), "status": "generating"}), 202


def _run_draft_generation(app_obj, draft_id, resume_text, jd_content, key_points, difficulty):
    with app_obj.app_context():
        questions = []
        errors = []
        for i, point in enumerate(key_points, start=1):
            try:
                topic = anthropic_service.generate_topic_stage(
                    resume_text=resume_text, jd_content=jd_content, jd_point=point,
                    training_level=difficulty, index=i,
                )
                strong_path = next((p for p in topic.get("answer_paths", []) if "strong" in p.get("path_label", "").lower()), None)
                questions.append({
                    "seq": i,
                    "jd_point": topic.get("jd_point", point),
                    "found_in_resume": topic.get("found_in_resume", False),
                    "evidence_from_resume": topic.get("evidence_from_resume"),
                    "opening_question": topic.get("opening_question", f"Tell me about your experience with {point}."),
                    "follow_up_question": (strong_path or {}).get("follow_up_question", "Can you elaborate further on that?"),
                    "edited": False,
                })
            except Exception as exc:
                errors.append(f"Skipped '{point}': {exc}")
                continue

            draft = InterviewDraft.query.get(draft_id)
            draft.questions_json = list(questions)
            db.session.commit()

        draft = InterviewDraft.query.get(draft_id)
        if not questions:
            draft.status = "failed"
            draft.error_message = "; ".join(errors) or "No questions could be generated."
        else:
            draft.status = "ready"
            draft.error_message = "; ".join(errors) if errors else None
        db.session.commit()
        db.session.remove()


@admin_bp.get("/users/<int:user_id>/interview-draft")
@role_required("admin")
def get_interview_draft(user_id):
    draft = (
        InterviewDraft.query.filter_by(user_id=user_id)
        .order_by(InterviewDraft.created_at.desc()).first()
    )
    return jsonify(draft.to_dict() if draft else None)


@admin_bp.put("/interview-draft/<int:draft_id>/question/<int:seq>")
@role_required("admin")
def edit_draft_question(draft_id, seq):
    import copy
    draft = InterviewDraft.query.get_or_404(draft_id)
    if draft.status == "approved":
        return jsonify({"error": "This draft is already approved. Regenerate a new draft to make changes."}), 400

    data = request.get_json(force=True) or {}
    # Deep-copy BEFORE mutating: mutating the same dict objects that
    # draft.questions_json already references makes SQLAlchemy's change
    # detection see identical before/after values and silently skip the
    # UPDATE. A deep copy guarantees a genuinely different object.
    questions = copy.deepcopy(draft.questions_json or [])
    for q in questions:
        if q["seq"] == seq:
            if "opening_question" in data:
                q["opening_question"] = data["opening_question"]
            if "follow_up_question" in data:
                q["follow_up_question"] = data["follow_up_question"]
            q["edited"] = True
            break
    else:
        return jsonify({"error": "Question not found in this draft."}), 404

    draft.questions_json = questions
    db.session.commit()
    return jsonify(draft.to_dict())


@admin_bp.post("/interview-draft/<int:draft_id>/question")
@role_required("admin")
def add_draft_question(draft_id):
    import copy
    draft = InterviewDraft.query.get_or_404(draft_id)
    if draft.status == "approved":
        return jsonify({"error": "This draft is already approved. Regenerate a new draft to make changes."}), 400

    data = request.get_json(force=True) or {}
    questions = copy.deepcopy(draft.questions_json or [])
    next_seq = max((q["seq"] for q in questions), default=0) + 1
    questions.append({
        "seq": next_seq,
        "jd_point": data.get("jd_point") or "Additional question",
        "found_in_resume": False,
        "evidence_from_resume": None,
        "opening_question": data.get("opening_question") or "",
        "follow_up_question": data.get("follow_up_question") or "",
        "edited": True,
    })
    draft.questions_json = questions
    draft.total_topics = len(questions)
    db.session.commit()
    return jsonify(draft.to_dict())


@admin_bp.delete("/interview-draft/<int:draft_id>/question/<int:seq>")
@role_required("admin")
def delete_draft_question(draft_id, seq):
    import copy
    draft = InterviewDraft.query.get_or_404(draft_id)
    if draft.status == "approved":
        return jsonify({"error": "This draft is already approved. Regenerate a new draft to make changes."}), 400

    questions = copy.deepcopy(draft.questions_json or [])
    remaining = [q for q in questions if q["seq"] != seq]
    if len(remaining) == len(questions):
        return jsonify({"error": "Question not found in this draft."}), 404
    if not remaining:
        return jsonify({"error": "A draft needs at least one question — add a replacement before removing the last one."}), 400

    draft.questions_json = remaining
    draft.total_topics = len(remaining)
    db.session.commit()
    return jsonify(draft.to_dict())


@admin_bp.post("/interview-draft/<int:draft_id>/approve")
@role_required("admin")
def approve_interview_draft(draft_id):
    draft = InterviewDraft.query.get_or_404(draft_id)
    if draft.status != "ready":
        return jsonify({"error": f"Draft is '{draft.status}', not ready to approve yet."}), 400
    if not draft.questions_json:
        return jsonify({"error": "This draft has no questions to approve."}), 400

    draft.status = "approved"
    draft.approved_at = datetime.utcnow()
    db.session.commit()
    return jsonify(draft.to_dict())
