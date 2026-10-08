import os
import sys

from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()


def _pick_async_mode():
    """Choose the Socket.IO async mode.

    - Production (Linux, gunicorn -k geventwebsocket...GeventWebSocketWorker -w 1):
      gevent + gevent-websocket are installed, so we use "gevent". A plain
      sync gunicorn worker cannot serve WebSockets, so this is required there.
    - Local dev (`python app.py`, e.g. Windows): gevent is usually not
      installed, so we fall back to "threading", which needs nothing extra.
    - SOCKETIO_ASYNC_MODE in the environment overrides the choice.
    """
    forced = os.getenv("SOCKETIO_ASYNC_MODE", "").strip().lower()
    if forced:
        return forced, "SOCKETIO_ASYNC_MODE"
    try:
        import gevent  # noqa: F401
        import geventwebsocket  # noqa: F401
    except ImportError:
        return "threading", "gevent / gevent-websocket not installed"
    return "gevent", "gevent + gevent-websocket installed"


_async_mode, _why = _pick_async_mode()
print(f"[code2hire] Socket.IO async_mode={_async_mode} ({_why})", file=sys.stderr, flush=True)

socketio = SocketIO(cors_allowed_origins="*", async_mode=_async_mode)
