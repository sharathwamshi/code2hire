import difflib
import os
import threading
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity
from werkzeug.utils import secure_filename

from extensions import db
from models import (
    User, InterviewConfig, InterviewSession, InterviewTurn,
    IntegrityEvent, SessionActionLog, InterviewReport, InterviewDraft, Notification,
    NON_BLOCKING_EVENT_TYPES,
)
from routes.utils import role_required
from services import anthropic_service
from services import azure_speech_service
from services.answer_signals import is_give_up_answer, strip_greeting

interview_bp = Blueprint("interview", __name__, url_prefix="/api/candidate/interview")

VIOLATION_SEVERITY = {
    "tab_switch": "medium", "window_blur": "low", "fullscreen_exit": "medium",
    "devtools": "high", "copy_paste": "low", "multi_face": "high",
    "no_face": "medium", "disconnect": "low",
}
VIOLATION_LABELS = {
    "tab_switch": "switched tabs", "window_blur": "left the interview window",
    "fullscreen_exit": "exited fullscreen", "devtools": "opened developer tools",
    "copy_paste": "pasted text into an answer", "multi_face": "multiple faces detected on camera",
    "no_face": "no face detected on camera", "disconnect": "lost connection",
}

# Blur notices are throttled on the admin side too, so a burst of them
# produces one bell notification, not dozens.
NOTICE_NOTIFY_COOLDOWN_S = 60

FOLLOW_UP_SIMILARITY_LIMIT = 0.85


def _active_config(user):
    return InterviewConfig.query.filter_by(user_id=user.id).first()


def _approved_draft_for(user):
    return (
        InterviewDraft.query.filter_by(user_id=user.id, jd_id=user.jd_id, status="approved")
        .order_by(InterviewDraft.approved_at.desc()).first()
    )


def _draft_turn_at(draft, step):
    """Flattens the draft's topics into 2 turns each (opening, then a canned
    follow-up). Returns (message, topic, is_closing) for the given step."""
    questions = draft.questions_json or []
    topic_index = step // 2
    if topic_index >= len(questions):
        return None, None, True
    q = questions[topic_index]
    if step % 2 == 0:
        return q["opening_question"], q["jd_point"], False
    return q["follow_up_question"], q["jd_point"], False


def _too_similar(candidate_text, earlier_questions):
    a = (candidate_text or "").lower().strip()
    return any(
        difflib.SequenceMatcher(None, a, (q or "").lower().strip()).ratio() >= FOLLOW_UP_SIMILARITY_LIMIT
        for q in earlier_questions
    )


def _adaptive_follow_up(user, session, step, answer_text):
    """Reviews the candidate's answer to this topic's opening question and returns a
    follow-up written FROM that answer. Returns None on any failure (or if the model
    just repeated an earlier question) so the caller can use the pre-generated
    follow-up instead - the interview must never stall on an API hiccup."""
    questions = session.draft.questions_json or []
    q = questions[step // 2]
    asked = [strip_greeting(t.content) for t in session.turns if t.role == "ai"]
    try:
        result = anthropic_service.generate_followup_question(
            candidate_name=user.full_name or user.username,
            jd_title=session.jd.title if session.jd else "",
            topic=q.get("jd_point", ""),
            resume_evidence=q.get("evidence_from_resume") if q.get("found_in_resume") else None,
            difficulty=session.difficulty,
            opening_question=q.get("opening_question", ""),
            candidate_answer=answer_text,
            questions_asked=asked,
        )
    except Exception:
        current_app.logger.exception("Adaptive follow-up failed for session %s; using the prepared one", session.id)
        return None

    follow_up = (result.get("follow_up_question") if isinstance(result, dict) else "") or ""
    follow_up = follow_up.strip()
    if not follow_up or _too_similar(follow_up, asked):
        return None
    return follow_up


def _transcript_for(session):
    return [{"role": t.role, "content": t.content, "topic": t.topic} for t in session.turns]


# ---------------------------------------------------------------------------
# Azure speech token
# ---------------------------------------------------------------------------

@interview_bp.get("/speech-token")
@role_required("candidate")
def speech_token():
    user = User.query.get_or_404(int(get_jwt_identity()))
    config = _active_config(user)

    if not azure_speech_service.is_configured():
        return jsonify({"configured": False}), 200

    try:
        token, region = azure_speech_service.issue_token()
    except Exception as exc:
        return jsonify({"configured": False, "error": str(exc)}), 200

    voice = (config.voice_id if config and config.voice_id else azure_speech_service.DEFAULT_VOICE)
    return jsonify({"configured": True, "token": token, "region": region, "voice": voice})


# ---------------------------------------------------------------------------
# MODULE A: AI-conducted interview
# ---------------------------------------------------------------------------

@interview_bp.get("/start-info")
@role_required("candidate")
def start_info():
    user = User.query.get_or_404(int(get_jwt_identity()))
    if user.active_stage != "interview":
        return jsonify({"error": "The interview is not currently available for your account. Please check with your admin."}), 403
    config = _active_config(user)
    if not config:
        return jsonify({"error": "No interview has been configured for you yet. Please contact your admin."}), 400
    if not user.jd:
        return jsonify({"error": "No job description assigned yet."}), 400
    if not user.resume_text:
        return jsonify({"error": "Please upload your resume before starting the interview."}), 400

    existing = (
        InterviewSession.query.filter_by(user_id=user.id, jd_id=user.jd_id, mode="ai")
        .order_by(InterviewSession.created_at.desc()).first()
    )
    return jsonify({
        "config": config.to_dict(),
        "jd_title": user.jd.title,
        "existing_session": existing.to_dict() if existing and existing.status != "completed" else None,
    })


@interview_bp.post("/start")
@role_required("candidate")
def start_interview():
    user = User.query.get_or_404(int(get_jwt_identity()))
    if user.active_stage != "interview":
        return jsonify({"error": "The interview is not currently available for your account. Please check with your admin."}), 403
    config = _active_config(user)
    if not config:
        return jsonify({"error": "No interview has been configured for you yet."}), 400
    if not user.jd or not user.resume_text:
        return jsonify({"error": "Your JD or resume is missing. Please contact your admin."}), 400

    existing = (
        InterviewSession.query.filter_by(user_id=user.id, jd_id=user.jd_id, mode="ai")
        .filter(InterviewSession.status.in_(["not_started", "in_progress", "paused"]))
        .order_by(InterviewSession.created_at.desc()).first()
    )

    if existing and existing.status == "paused":
        return jsonify({"error": "Your interview is paused pending admin review. Please wait to be resumed.", "session": existing.to_dict()}), 423

    if existing and existing.status == "in_progress":
        session = existing
    else:
        if not existing:
            # No not_started/in_progress/paused session to continue: this would create a
            # brand new attempt. An admin restarting an existing session (which leaves it
            # "not_started") already reuses `existing` above and is exempt from this cap -
            # only a candidate self-serving a fresh /start call is gated.
            completed_count = InterviewSession.query.filter_by(
                user_id=user.id, jd_id=user.jd_id, mode="ai", status="completed",
            ).count()
            if completed_count >= (config.attempts_allowed or 1):
                return jsonify({
                    "error": (
                        f"You've completed {completed_count} of {config.attempts_allowed} allowed interview "
                        "attempt(s). Please contact your admin if you need another attempt."
                    ),
                }), 403
        session = existing or InterviewSession(
            user_id=user.id, jd_id=user.jd_id, config_id=config.id, mode="ai", difficulty=config.difficulty,
        )
        if not existing:
            db.session.add(session)
        session.status = "in_progress"
        session.started_at = session.started_at or datetime.utcnow()
        if not session.draft_id:
            approved_draft = _approved_draft_for(user)
            if approved_draft:
                session.draft_id = approved_draft.id
        db.session.commit()

    if not session.turns:
        if session.draft:
            message, topic, _ = _draft_turn_at(session.draft, 0)
            greeting = f"Hello {user.full_name or user.username}, I'm your AI interviewer for the {user.jd.title} role. Let's begin.\n\n{message}"
            turn = InterviewTurn(session_id=session.id, seq=1, role="ai", content=greeting, topic=topic)
            db.session.add(turn)
            session.current_seq = 1
            session.question_count = 1
            session.draft_step = 1
            db.session.commit()
        else:
            try:
                key_points = user.jd.key_points or []
                msg = anthropic_service.generate_next_interview_message(
                    candidate_name=user.full_name or user.username,
                    resume_text=user.resume_text, jd_content=user.jd.content, jd_key_points=key_points,
                    difficulty=config.difficulty, transcript=[], questions_asked=0, max_questions=config.max_questions,
                )
            except Exception as exc:
                return jsonify({"error": f"Could not start the interview: {exc}"}), 502

            turn = InterviewTurn(session_id=session.id, seq=1, role="ai", content=msg["message"], topic=msg.get("topic"))
            db.session.add(turn)
            session.current_seq = 1
            session.question_count = 1
            db.session.commit()

    total_questions = len(session.draft.questions_json) if session.draft and session.draft.questions_json else config.max_questions
    return jsonify({
        "session": session.to_dict(include_turns=True), "voice_enabled": config.voice_enabled,
        "voice_id": config.voice_id, "total_questions": total_questions, "using_draft": bool(session.draft_id),
    })


@interview_bp.post("/<int:session_id>/answer")
@role_required("candidate")
def submit_answer(session_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    if session.status == "paused":
        return jsonify({"error": "Interview is paused pending admin review."}), 423
    if session.status != "in_progress":
        return jsonify({"error": f"Interview is '{session.status}', cannot accept an answer."}), 400

    data = request.get_json(force=True) or {}
    answer_text = (data.get("answer") or "").strip()
    if not answer_text:
        return jsonify({"error": "Answer text is required"}), 400

    next_seq = session.current_seq + 1
    db.session.add(InterviewTurn(session_id=session.id, seq=next_seq, role="candidate", content=answer_text))
    session.current_seq = next_seq
    db.session.commit()

    if session.draft:
        answered_step = session.draft_step - 1
        step_to_deliver = session.draft_step
        if answered_step % 2 == 0 and is_give_up_answer(answer_text):
            # The candidate didn't know the opening question — skip the follow-up
            # for this topic entirely and move straight to the next one.
            step_to_deliver = session.draft_step + 1

        message, topic, is_closing = _draft_turn_at(session.draft, step_to_deliver)
        if not is_closing and step_to_deliver % 2 == 1:
            # A follow-up slot: analyse what the candidate actually said and ask about
            # that. The pre-generated follow-up is only the fallback.
            message = _adaptive_follow_up(user, session, step_to_deliver, answer_text) or message
        if is_closing:
            message = f"That covers everything I needed to ask, {user.full_name or user.username} — thank you for your time. This concludes the interview."
        next_seq = session.current_seq + 1
        ai_turn = InterviewTurn(session_id=session.id, seq=next_seq, role="ai", content=message, topic=topic)
        db.session.add(ai_turn)
        session.current_seq = next_seq
        session.draft_step = step_to_deliver + 1
        if not is_closing and step_to_deliver % 2 == 0:
            session.question_count += 1
        if is_closing:
            session.status = "completed"
            session.completed_at = datetime.utcnow()
        db.session.commit()

        if is_closing:
            app_obj = current_app._get_current_object()
            threading.Thread(target=_generate_report_async, args=(app_obj, session.id), daemon=True).start()

        return jsonify({"turn": ai_turn.to_dict(), "session_status": session.status})

    config = _active_config(user)
    try:
        msg = anthropic_service.generate_next_interview_message(
            candidate_name=user.full_name or user.username,
            resume_text=user.resume_text, jd_content=user.jd.content, jd_key_points=(user.jd.key_points or []),
            difficulty=session.difficulty, transcript=_transcript_for(session),
            questions_asked=session.question_count, max_questions=config.max_questions if config else 12,
        )
    except Exception as exc:
        return jsonify({"error": f"Could not get the next question: {exc}"}), 502

    next_seq = session.current_seq + 1
    ai_turn = InterviewTurn(session_id=session.id, seq=next_seq, role="ai", content=msg["message"], topic=msg.get("topic"))
    db.session.add(ai_turn)
    session.current_seq = next_seq
    if not msg.get("is_closing"):
        session.question_count += 1

    is_closing = bool(msg.get("is_closing"))
    if is_closing:
        session.status = "completed"
        session.completed_at = datetime.utcnow()
    db.session.commit()

    if is_closing:
        app_obj = current_app._get_current_object()
        threading.Thread(target=_generate_report_async, args=(app_obj, session.id), daemon=True).start()

    return jsonify({"turn": ai_turn.to_dict(), "session_status": session.status})


def _generate_report_async(app_obj, session_id):
    with app_obj.app_context():
        session = InterviewSession.query.get(session_id)
        if not session or session.report:
            return
        user = session.user
        name = user.full_name or user.username
        try:
            report_data = anthropic_service.generate_interview_report(
                transcript=_transcript_for(session), resume_text=user.resume_text,
                jd_content=session.jd.content, candidate_name=name,
                interview_note=session.completion_note(),
            )
        except Exception:
            app_obj.logger.exception("Automatic report generation failed for session %s", session_id)
            db.session.rollback()
            db.session.add(Notification(
                type="report_failed", session_id=session.id,
                message=f"The report for {name}'s interview could not be generated automatically. Open the session and use Generate report.",
            ))
            db.session.commit()
            db.session.remove()
            return

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
        if session.end_reason == "candidate_exit":
            planned = session.planned_count()
            message = (f"Report ready for {name}'s early-ended interview "
                       f"({session.answered_count()}{f' of {planned}' if planned else ''} questions answered). "
                       "Review it, then share it with the candidate.")
        else:
            message = f"Interview completed for {name} — report ready. Review it, then share it with the candidate."
        db.session.add(Notification(type="interview_completed", session_id=session.id, message=message))
        db.session.commit()
        db.session.remove()


@interview_bp.post("/<int:session_id>/exit")
@role_required("candidate")
def candidate_exit_interview(session_id):
    """The candidate chose to leave. The interview is closed as COMPLETED using
    everything collected so far (including an answer they had typed/spoken but not
    yet sent), and the report is built from that data."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    if session.status == "completed":  # double click / retry: already done
        return jsonify({"status": "completed", "answered": session.answered_count(),
                        "planned": session.planned_count(), "report_pending": False})
    if session.status != "in_progress":
        return jsonify({"error": f"Interview is '{session.status}', it can't be ended from here."}), 400

    data = request.get_json(silent=True) or {}
    pending = (data.get("pending_answer") or "").strip()
    last_turn = session.turns[-1] if session.turns else None
    if pending and last_turn is not None and last_turn.role == "ai":
        seq = session.current_seq + 1
        db.session.add(InterviewTurn(session_id=session.id, seq=seq, role="candidate", content=pending))
        session.current_seq = seq

    answered = session.answered_count()  # COUNT query: autoflush includes the turn added above
    planned = session.planned_count()
    of = f" of {planned}" if planned else ""
    name = user.full_name or user.username

    session.status = "completed"
    session.completed_at = datetime.utcnow()
    session.end_reason = "candidate_exit"

    if answered == 0:
        note = "Candidate exited before answering any question"
        message = f"{name} exited their interview before answering any question — there is nothing to report on."
    else:
        note = f"Candidate exited the interview early — {answered}{of} question(s) answered"
        message = f"{name} ended their interview early ({answered}{of} answered). The report is being generated."
    db.session.add(SessionActionLog(session_id=session.id, action="exit", actor_admin_id=None, note=note))
    db.session.add(Notification(type="interview_exited", session_id=session.id, message=message))
    db.session.commit()

    if answered > 0:
        app_obj = current_app._get_current_object()
        threading.Thread(target=_generate_report_async, args=(app_obj, session.id), daemon=True).start()

    return jsonify({"status": "completed", "answered": answered, "planned": planned, "report_pending": answered > 0})


@interview_bp.get("/history")
@role_required("candidate")
def interview_history():
    """The candidate's own previous interviews, newest first, each with a short
    result line when a report has been generated."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    sessions = (
        InterviewSession.query
        .filter(InterviewSession.user_id == user.id, InterviewSession.status.in_(["completed", "in_progress", "paused"]))
        .order_by(InterviewSession.created_at.desc()).all()
    )
    rows = []
    for s in sessions:
        # A report the admin has not shared is invisible to the candidate - they cannot even
        # tell whether one has been generated. "has_report" therefore means "available to you".
        report = s.report if (s.report and s.report.shared_with_candidate) else None
        rows.append({
            "id": s.id, "mode": s.mode, "jd_title": s.jd.title if s.jd else None,
            "status": s.status, "end_reason": s.end_reason,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "answered_count": s.answered_count(),
            "planned_count": s.planned_count() if s.mode == "ai" else None,
            "has_report": report is not None,
            "report": {
                "overall_score": report.overall_score, "verdict": report.verdict,
                "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            } if report else None,
        })
    return jsonify(rows)


@interview_bp.get("/<int:session_id>/report")
@role_required("candidate")
def candidate_interview_report(session_id):
    """The candidate-facing view of a report. It deliberately leaves out the hiring
    recommendation and the selection rationale: those are the admin's call to share."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()
    report = session.report
    if not report or not report.shared_with_candidate:
        return jsonify({"error": "No report is available for this interview yet."}), 404

    summary = report.summary_json or {}
    return jsonify({
        "session_id": session.id, "jd_title": session.jd.title if session.jd else None,
        "generated_at": report.generated_at.isoformat() if report.generated_at else None,
        "overall_score": report.overall_score, "verdict": report.verdict,
        "ended_early": session.end_reason == "candidate_exit",
        "answered_count": session.answered_count(),
        "planned_count": session.planned_count() if session.mode == "ai" else None,
        "summary": {k: summary.get(k, []) for k in
                    ("key_strengths", "technical_skills", "soft_skills", "areas_for_improvement")},
        "qna": report.qna_json or [],
    })


@interview_bp.get("/<int:session_id>/status")
@role_required("candidate")
def interview_status(session_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()
    return jsonify(session.to_dict(include_turns=True))


# ---------------------------------------------------------------------------
# Integrity violation reporting
# ---------------------------------------------------------------------------

def _record_notice(session, user, event_type):
    """Window-focus style events: logged for the admin and reported through the
    notification bell, but the interview is NOT paused and the event does not
    count towards the violation total. Bell notifications are throttled so a
    burst of blurs doesn't flood the admin."""
    if session.status != "in_progress":
        return jsonify({"status": session.status, "paused": session.status == "paused",
                        "violation_count": session.violation_count(), "notice": True})

    db.session.add(IntegrityEvent(
        session_id=session.id, event_type=event_type, severity="low",
        active_question_seq=session.current_seq,
    ))

    recently_notified = Notification.query.filter(
        Notification.session_id == session.id,
        Notification.type == "focus_notice",
        Notification.created_at >= datetime.utcnow() - timedelta(seconds=NOTICE_NOTIFY_COOLDOWN_S),
    ).first()
    if not recently_notified:
        candidate_name = user.full_name or user.username
        label = VIOLATION_LABELS.get(event_type, event_type)
        db.session.add(Notification(
            type="focus_notice", session_id=session.id,
            message=f"{candidate_name} {label} during their interview (notice only - the interview was not paused).",
        ))
    db.session.commit()

    return jsonify({"status": session.status, "paused": False,
                    "violation_count": session.violation_count(), "notice": True})


@interview_bp.post("/<int:session_id>/violation")
@role_required("candidate")
def report_violation(session_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    data = request.get_json(force=True) or {}
    event_type = data.get("event_type", "tab_switch")
    severity = VIOLATION_SEVERITY.get(event_type, "medium")

    if event_type in NON_BLOCKING_EVENT_TYPES:
        return _record_notice(session, user, event_type)

    event = IntegrityEvent(
        session_id=session.id, event_type=event_type, severity=severity,
        active_question_seq=session.current_seq,
    )
    db.session.add(event)

    was_in_progress = session.status == "in_progress"
    if was_in_progress:
        session.status = "paused"
        session.paused_at = datetime.utcnow()
        session.pause_reason = "violation"
        db.session.add(SessionActionLog(session_id=session.id, action="pause", actor_admin_id=None,
                                         note=f"Auto-paused: {VIOLATION_LABELS.get(event_type, event_type)}"))

    violation_count = session.violation_count()
    label = VIOLATION_LABELS.get(event_type, event_type)
    candidate_name = user.full_name or user.username
    db.session.add(Notification(
        type="violation", session_id=session.id,
        message=f"{candidate_name} {label} during their interview (violation #{violation_count}). Session paused.",
    ))
    db.session.commit()

    return jsonify({"status": session.status, "violation_count": violation_count, "event": event.to_dict()})


@interview_bp.post("/<int:session_id>/stop")
@role_required("candidate")
def candidate_stop_interview(session_id):
    """The candidate asked (in speech or typed text) to stop the interview.
    This is NOT an integrity violation — no IntegrityEvent is logged and the
    violation count is untouched — it's simply paused for admin review, the
    same as any other pause, just tagged with a different reason so the
    candidate and admin both see accurate messaging about why."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    if session.status != "in_progress":
        return jsonify({"error": f"Interview is '{session.status}', nothing to stop."}), 400

    session.status = "paused"
    session.paused_at = datetime.utcnow()
    session.pause_reason = "candidate_stop"
    db.session.add(SessionActionLog(session_id=session.id, action="pause", actor_admin_id=None,
                                     note="Candidate asked to stop the interview"))
    candidate_name = user.full_name or user.username
    db.session.add(Notification(
        type="candidate_stop_request", session_id=session.id,
        message=f"{candidate_name} asked to stop their interview. Session paused pending admin review.",
    ))
    db.session.commit()

    return jsonify({"status": session.status})


# ---------------------------------------------------------------------------
# MODULE B: Live human interview
# ---------------------------------------------------------------------------

@interview_bp.post("/live/join")
@role_required("candidate")
def join_live_interview():
    user = User.query.get_or_404(int(get_jwt_identity()))
    if user.active_stage != "interview":
        return jsonify({"error": "The interview is not currently available for your account. Please check with your admin."}), 403
    data = request.get_json(force=True) or {}
    token = data.get("token", "")

    config = InterviewConfig.query.filter_by(user_id=user.id, link_token=token).first()
    if not config:
        return jsonify({"error": "Invalid or expired interview link."}), 404
    if config.link_expires_at and config.link_expires_at < datetime.utcnow():
        return jsonify({"error": "This interview link has expired. Ask your admin for a new one."}), 410
    if not user.jd:
        return jsonify({"error": "No job description assigned yet."}), 400

    session = (
        InterviewSession.query.filter_by(user_id=user.id, jd_id=user.jd_id, mode="live")
        .filter(InterviewSession.status.in_(["not_started", "in_progress", "paused"]))
        .order_by(InterviewSession.created_at.desc()).first()
    )
    if session and session.status == "paused":
        return jsonify({"error": "Your interview is paused pending admin review.", "session": session.to_dict()}), 423

    if not session:
        session = InterviewSession(user_id=user.id, jd_id=user.jd_id, config_id=config.id, mode="live", difficulty=config.difficulty)
        db.session.add(session)
        db.session.commit()

    session.status = "in_progress"
    session.started_at = session.started_at or datetime.utcnow()
    db.session.commit()

    return jsonify({"session": session.to_dict(), "room": f"session-{session.id}", "interviewer_name": config.interviewer_name})


@interview_bp.post("/live/<int:session_id>/finish")
@role_required("candidate")
def finish_live_interview(session_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify(session.to_dict())


@interview_bp.post("/<int:session_id>/upload-recording")
@role_required("candidate")
def upload_ai_recording(session_id):
    """Uploads the candidate's camera/mic recording for an AI-conducted interview.
    Same storage as the live-call recording (one file per session, re-uploading
    replaces it) - just a separate route since it's reached from a different screen."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]

    folder = current_app.config["RECORDINGS_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    filename = secure_filename(f"session_{session.id}_{f.filename or 'recording.webm'}")
    path = os.path.join(folder, filename)
    f.save(path)

    session.recording_path = path
    db.session.commit()
    return jsonify({"message": "Recording uploaded"})


@interview_bp.post("/live/<int:session_id>/upload-recording")
@role_required("candidate")
def upload_recording(session_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = InterviewSession.query.filter_by(id=session_id, user_id=user.id).first_or_404()

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]

    folder = current_app.config["RECORDINGS_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    filename = secure_filename(f"session_{session.id}_{f.filename or 'recording.webm'}")
    path = os.path.join(folder, filename)
    f.save(path)

    session.recording_path = path
    db.session.commit()
    return jsonify({"message": "Recording uploaded", "session": session.to_dict()})
