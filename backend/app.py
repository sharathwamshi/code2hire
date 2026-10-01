import os

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from config import Config
from extensions import db, bcrypt, jwt, socketio
from routes.utils import role_required


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["RECORDINGS_FOLDER"], exist_ok=True)

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}}, supports_credentials=True)

    from routes.auth import auth_bp
    from routes.admin import admin_bp
    from routes.candidate import candidate_bp
    from routes.interview import interview_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(candidate_bp)
    app.register_blueprint(interview_bp)

    import sockets  # noqa: F401 - registers socketio event handlers

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "Code2Hire API"})

    @app.get("/api/webrtc/ice-servers")
    @role_required("admin", "candidate")
    def webrtc_ice_servers():
        """ICE server list for the candidate-camera <-> admin live-view WebRTC connection.

        STUN alone (the public Google server below) only works when at least one peer has
        an open/permissive NAT - it fails whenever both sides are on restrictive networks,
        which is the normal case once this is actually hosted rather than both peers being
        on the same development machine. A TURN relay is required for those cases.

        Configure one via TURN_URL / TURN_USERNAME / TURN_CREDENTIAL in .env (works with
        any provider that issues static long-term credentials - a self-hosted coturn, or a
        managed service such as Twilio Network Traversal Service, Metered, or Xirsys).
        TURN_URL may hold several comma-separated URLs sharing the same credentials, e.g.
        a UDP variant plus a TCP/443 variant for networks that block arbitrary UDP ports.

        Without TURN_URL set, this still returns the STUN-only list - never a hard
        failure - so nothing already working (easier network pairings) regresses; live
        view simply won't connect across stricter network combinations until TURN is
        configured. The credential itself is never shipped in frontend code.
        """
        servers = [{"urls": "stun:stun.l.google.com:19302"}]
        turn_url = os.getenv("TURN_URL", "")
        turn_urls = [u.strip() for u in turn_url.split(",") if u.strip()]
        if turn_urls:
            servers.append({
                "urls": turn_urls if len(turn_urls) > 1 else turn_urls[0],
                "username": os.getenv("TURN_USERNAME", ""),
                "credential": os.getenv("TURN_CREDENTIAL", ""),
            })
        return jsonify({"iceServers": servers})

    @jwt.unauthorized_loader
    def unauthorized_callback(reason):
        return jsonify({"error": "Authentication required", "detail": reason}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Invalid token", "detail": reason}), 422

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token expired"}), 401

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5050))
    socketio.run(app, host="0.0.0.0", port=port, debug=True, allow_unsafe_werkzeug=True)
