from datetime import datetime
import threading

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity

from extensions import db
from models import User, PrepFlow, PrepFlowStage, Feedback
from routes.utils import role_required
from services import anthropic_service
from services.resume_parser import extract_text_from_upload, UnsupportedResumeFormat

candidate_bp = Blueprint("candidate", __name__, url_prefix="/api/candidate")


@candidate_bp.get("/dashboard")
@role_required("candidate")
def dashboard():
    user = User.query.get_or_404(int(get_jwt_identity()))
    return jsonify({"user": user.to_dict(), "jd": user.jd.to_dict() if user.jd else None, "has_resume": bool(user.resume_text)})


@candidate_bp.post("/resume")
@role_required("candidate")
def upload_own_resume():
    user = User.query.get_or_404(int(get_jwt_identity()))
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
    return jsonify(user.to_dict(include_resume=True))


@candidate_bp.get("/resume")
@role_required("candidate")
def get_own_resume():
    user = User.query.get_or_404(int(get_jwt_identity()))
    return jsonify({"resume_text": user.resume_text, "resume_filename": user.resume_filename, "resume_updated_text": user.resume_updated_text})


@candidate_bp.get("/prepare")
@role_required("candidate")
def get_prepare_flow():
    user = User.query.get_or_404(int(get_jwt_identity()))
    if user.active_stage != "prepare":
        return jsonify({"error": "Preparation is not currently available for your account. Please check with your admin."}), 403
    if not user.jd:
        return jsonify({"error": "No JD has been assigned to you yet. Please contact your admin."}), 400
    if not user.resume_text:
        return jsonify({"error": "Please upload your resume first so we can prepare tailored questions."}), 400

    existing = (
        PrepFlow.query.filter_by(user_id=user.id, jd_id=user.jd_id)
        .filter(PrepFlow.status.in_(["complete", "complete_with_errors"]))
        .order_by(PrepFlow.generated_at.desc()).first()
    )
    if existing:
        return jsonify({
            "cached": True, "prep_flow_id": existing.id, "flow": existing.to_flow_dict(),
            "generated_at": existing.generated_at.isoformat(),
            "warnings": [existing.error_message] if existing.error_message else None,
        })
    return jsonify({"cached": False, "flow": None})


@candidate_bp.post("/prepare/start")
@role_required("candidate")
def start_prepare_flow():
    user = User.query.get_or_404(int(get_jwt_identity()))
    if user.active_stage != "prepare":
        return jsonify({"error": "Preparation is not currently available for your account. Please check with your admin."}), 403
    if not user.jd:
        return jsonify({"error": "No JD has been assigned to you yet. Please contact your admin."}), 400
    if not user.resume_text:
        return jsonify({"error": "Please upload your resume first so we can prepare tailored questions."}), 400

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

    prep = PrepFlow(user_id=user.id, jd_id=user.jd_id, status="in_progress", total_topics=len(key_points))
    db.session.add(prep)
    db.session.commit()

    app_obj = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_staged_generation,
        args=(app_obj, prep.id, user.resume_text, user.jd.content, key_points, user.training_level),
        daemon=True,
    )
    thread.start()
    return jsonify({"prep_flow_id": prep.id, "total_topics": len(key_points), "status": "in_progress"}), 202


@candidate_bp.get("/prepare/status/<int:prep_flow_id>")
@role_required("candidate")
def prepare_status(prep_flow_id):
    user = User.query.get_or_404(int(get_jwt_identity()))
    prep = PrepFlow.query.filter_by(id=prep_flow_id, user_id=user.id).first()
    if not prep:
        return jsonify({"error": "Prep run not found"}), 404
    return jsonify(prep.to_dict())


def _run_staged_generation(app_obj, prep_id, resume_text, jd_content, key_points, training_level):
    with app_obj.app_context():
        errors = []
        for i, point in enumerate(key_points, start=1):
            try:
                topic = anthropic_service.generate_topic_stage(
                    resume_text=resume_text, jd_content=jd_content, jd_point=point,
                    training_level=training_level, index=i,
                )
            except Exception as exc:
                errors.append(f"Skipped '{point}': {exc}")
                continue
            db.session.add(PrepFlowStage(prep_flow_id=prep_id, stage_type="topic", seq=i, payload=topic))
            db.session.commit()

        try:
            projects = anthropic_service.generate_project_stage(resume_text=resume_text, jd_content=jd_content, training_level=training_level)
            db.session.add(PrepFlowStage(prep_flow_id=prep_id, stage_type="project", seq=0, payload=projects))
            db.session.commit()
        except Exception as exc:
            errors.append(f"Project questions unavailable: {exc}")

        try:
            tips = anthropic_service.generate_tips_stage(resume_text=resume_text, jd_content=jd_content, training_level=training_level)
            db.session.add(PrepFlowStage(prep_flow_id=prep_id, stage_type="tips", seq=0, payload=tips))
            db.session.commit()
        except Exception as exc:
            errors.append(f"Prep tips unavailable: {exc}")

        prep = PrepFlow.query.get(prep_id)
        has_any_topic = PrepFlowStage.query.filter_by(prep_flow_id=prep_id, stage_type="topic").count() > 0
        if not has_any_topic:
            prep.status = "failed"
            prep.error_message = "; ".join(errors) or "No topics could be generated."
        else:
            prep.status = "complete" if not errors else "complete_with_errors"
            prep.error_message = "; ".join(errors) if errors else None
        prep.completed_at = datetime.utcnow()
        db.session.commit()
        db.session.remove()


@candidate_bp.post("/feedback")
@role_required("candidate")
def submit_feedback():
    user = User.query.get_or_404(int(get_jwt_identity()))
    data = request.get_json(force=True) or {}
    items = data.get("items")
    if not items or not isinstance(items, list):
        return jsonify({"error": "items (list of {topic, self_rating, comments}) is required"}), 400

    created = []
    for item in items:
        topic = (item.get("topic") or "").strip()
        rating = item.get("self_rating")
        if not topic or rating is None:
            continue
        rating = max(1, min(5, int(rating)))
        fb = Feedback(user_id=user.id, topic=topic, self_rating=rating, comments=item.get("comments"))
        db.session.add(fb)
        created.append(fb)
    db.session.commit()
    return jsonify({"created": [f.to_dict() for f in created], "avg_rating": user.avg_rating()}), 201


@candidate_bp.get("/feedback")
@role_required("candidate")
def list_own_feedback():
    user = User.query.get_or_404(int(get_jwt_identity()))
    feedbacks = Feedback.query.filter_by(user_id=user.id).order_by(Feedback.created_at.desc()).all()
    return jsonify({"feedback": [f.to_dict() for f in feedbacks], "avg_rating": user.avg_rating()})
