from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from extensions import db, bcrypt
from models import User, LoginSession

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username or password"}), 401

    user.login_count = (user.login_count or 0) + 1
    user.last_login_at = datetime.utcnow()
    session = LoginSession(user_id=user.id)
    db.session.add(session)
    db.session.commit()

    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role, "username": user.username})
    return jsonify({"token": token, "user": user.to_dict(), "session_id": session.id})


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get_or_404(int(get_jwt_identity()))
    return jsonify(user.to_dict())


@auth_bp.post("/change-password")
@jwt_required()
def change_password():
    user = User.query.get_or_404(int(get_jwt_identity()))
    data = request.get_json(force=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not bcrypt.check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "Current password is incorrect"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    user.must_change_password = False
    db.session.commit()
    return jsonify({"message": "Password updated"})


@auth_bp.post("/heartbeat")
@jwt_required()
def heartbeat():
    user = User.query.get_or_404(int(get_jwt_identity()))
    data = request.get_json(force=True) or {}
    session_id = data.get("session_id")

    session = None
    if session_id:
        session = LoginSession.query.filter_by(id=session_id, user_id=user.id).first()
    if not session:
        session = LoginSession.query.filter_by(user_id=user.id, logout_at=None).order_by(LoginSession.login_at.desc()).first()
    if not session:
        return jsonify({"message": "no active session"}), 200

    now = datetime.utcnow()
    elapsed = int((now - session.last_heartbeat_at).total_seconds())
    elapsed = max(0, min(elapsed, 120))
    session.duration_seconds = (session.duration_seconds or 0) + elapsed
    session.last_heartbeat_at = now
    user.total_time_seconds = (user.total_time_seconds or 0) + elapsed
    db.session.commit()
    return jsonify({"message": "ok"})


@auth_bp.post("/logout")
@jwt_required()
def logout():
    user = User.query.get_or_404(int(get_jwt_identity()))
    session = LoginSession.query.filter_by(user_id=user.id, logout_at=None).order_by(LoginSession.login_at.desc()).first()
    if session:
        session.logout_at = datetime.utcnow()
        db.session.commit()
    return jsonify({"message": "logged out"})
