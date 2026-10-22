import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

load_dotenv()

from config import Config
from extensions import bcrypt, db, jwt, socketio
from routes.admin import admin_bp
from routes.auth import auth_bp
from routes.candidate import candidate_bp
from routes.hub import hub_bp
from routes.interview import interview_bp
import sockets


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, origins=[app.config["FRONTEND_ORIGIN"]])
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app, cors_allowed_origins="*")

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(hub_bp)
    app.register_blueprint(candidate_bp)
    app.register_blueprint(interview_bp)

    @app.get("/api/webrtc/ice-servers")
    def ice_servers():
        servers = [{"urls": "stun:stun.l.google.com:19302"}]
        turn_url = os.getenv("TURN_URL", "").strip()
        if turn_url:
            servers.append({
                "urls": turn_url,
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
