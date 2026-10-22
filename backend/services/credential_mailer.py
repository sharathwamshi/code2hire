from base64 import urlsafe_b64encode
from hashlib import sha256
import smtplib
import ssl
from email.message import EmailMessage

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

from models import Setting


class CredentialEmailError(Exception):
    pass


def _password_cipher():
    secret = current_app.config["SECRET_KEY"].encode("utf-8")
    return Fernet(urlsafe_b64encode(sha256(secret).digest()))


def save_smtp_password(password):
    encrypted = _password_cipher().encrypt(password.encode("utf-8")).decode("ascii")
    Setting.set("smtp_password", f"fernet:{encrypted}")


def _get_smtp_password():
    stored = Setting.get("smtp_password")
    if not stored:
        return current_app.config["SMTP_PASSWORD"]
    if not stored.startswith("fernet:"):
        raise CredentialEmailError("Saved SMTP password is not encrypted. Re-enter and save it in Admin Settings.")
    try:
        return _password_cipher().decrypt(stored.removeprefix("fernet:").encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise CredentialEmailError("Could not decrypt the saved SMTP password. Re-enter it in Admin Settings.") from exc


def _smtp_settings():
    config = current_app.config
    return {
        "host": Setting.get("smtp_host", config["SMTP_HOST"]),
        "port": int(Setting.get("smtp_port", str(config["SMTP_PORT"]))),
        "username": Setting.get("smtp_username", config["SMTP_USERNAME"]),
        "password": _get_smtp_password(),
        "from_email": Setting.get("smtp_from_email", config["SMTP_FROM_EMAIL"]),
        "use_tls": Setting.get("smtp_use_tls", str(config["SMTP_USE_TLS"])).lower() == "true",
        "use_ssl": Setting.get("smtp_use_ssl", str(config["SMTP_USE_SSL"])).lower() == "true",
    }


def _connect_smtp(settings):
    if settings["use_ssl"]:
        server = smtplib.SMTP_SSL(
            settings["host"], settings["port"], timeout=15, context=ssl.create_default_context()
        )
    else:
        server = smtplib.SMTP(settings["host"], settings["port"], timeout=15)
        server.ehlo()
        if settings["use_tls"]:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()

    if settings["username"]:
        server.login(settings["username"], settings["password"])
    return server


def test_smtp_connection():
    settings = _smtp_settings()
    if not settings["host"] or not settings["username"]:
        raise CredentialEmailError("SMTP host and username are required.")
    if not settings["password"]:
        raise CredentialEmailError("Enter and save the mailbox password before testing SMTP.")
    try:
        with _connect_smtp(settings) as server:
            server.noop()
    except (OSError, ValueError, smtplib.SMTPException) as exc:
        raise CredentialEmailError("SMTP connection failed. Check the server, port, and mailbox credentials.") from exc


def send_temporary_password(email, username, password):
    if not email:
        return {"status": "not_sent", "message": "No email address is set; share the credentials manually."}

    config = current_app.config
    settings = _smtp_settings()
    sender = settings["from_email"] or settings["username"]
    if not settings["host"] or not sender:
        return {"status": "not_sent", "message": "SMTP is not configured; share the credentials manually."}

    message = EmailMessage()
    message["Subject"] = "Your Code2Hire sign-in credentials"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"""Hello,

Your Code2Hire account is ready.

Username: {username}
Temporary password: {password}
Sign in at: {config["FRONTEND_ORIGIN"]}

You will be asked to change this temporary password after signing in.
"""
    )

    try:
        with _connect_smtp(settings) as server:
            server.send_message(message)
    except (OSError, ValueError, smtplib.SMTPException) as exc:
        raise CredentialEmailError("Credential email could not be sent. Check the SMTP settings.") from exc

    return {"status": "sent", "message": f"Temporary credentials emailed to {email}."}
