from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()
socketio = SocketIO(cors_allowed_origins="*", async_mode="gevent")
# "gevent" is explicit, not auto-detected, on purpose: if gevent is ever missing from
# the environment this should fail loudly on startup (ImportError) rather than silently
# falling back to "threading", which is what caused repeated WORKER TIMEOUT / crash-loop
# under gunicorn's default sync worker in production (it can only serve one request at a
# time, and a WebSocket connection blocks a sync worker for its entire lifetime).
# Run gunicorn with: -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1
