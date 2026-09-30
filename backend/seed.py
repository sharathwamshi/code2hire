"""
Seeds a fresh database with the schema (if not already there) and exactly one
admin account - nothing else. No candidates, no job descriptions, no sessions.

Two supported ways to set up a new server; both end in the same place:

  1. Import the schema file, then seed (recommended - the schema file is the
     exact, hand-verified structure; this just adds the admin on top of it):

       mysql -u <user> -p acknowledgermate < acknowledgermate.sql
       cd backend && python seed.py

  2. Seed only, no import first (creates any table that doesn't already exist,
     from the current models, then adds the admin):

       cd backend && python seed.py

Path 2 relies on the models in this codebase matching the schema file. If you've
made a manual schema change that isn't reflected in models.py, prefer path 1.

Safe to run more than once: if the admin username already exists, nothing changes
and no second admin is created.

Configure the admin via environment variables rather than editing this file, so a
real password never has to live in a script that gets reused across servers. If
DEFAULT_ADMIN_PASSWORD is left unset, a secure random one is generated and printed
ONCE below - there is no hardcoded fallback password.

  DEFAULT_ADMIN_USERNAME    default: admin
  DEFAULT_ADMIN_PASSWORD    default: a securely random password, printed once
  DEFAULT_ADMIN_FULL_NAME   default: Platform Admin
  DEFAULT_ADMIN_EMAIL       default: none

Example:
  DEFAULT_ADMIN_USERNAME=boss DEFAULT_ADMIN_PASSWORD='a-real-password' python seed.py
"""
import os
import secrets
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from extensions import db, bcrypt
from models import User

app = create_app()


def seed_admin():
    username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    full_name = os.getenv("DEFAULT_ADMIN_FULL_NAME", "Platform Admin")
    email = os.getenv("DEFAULT_ADMIN_EMAIL") or None
    password = os.getenv("DEFAULT_ADMIN_PASSWORD")

    existing = User.query.filter_by(username=username).first()
    if existing:
        print(f"Admin user '{username}' already exists (id={existing.id}). Skipping.")
        return

    generated = False
    if not password:
        password = secrets.token_urlsafe(12)
        generated = True

    admin = User(
        username=username,
        password_hash=bcrypt.generate_password_hash(password).decode("utf-8"),
        role="admin",
        full_name=full_name,
        email=email,
        training_level="medium",
        active_stage="prepare",
        must_change_password=True,  # a seeded/generated password must be changed on first login
    )
    db.session.add(admin)
    db.session.commit()

    print(f"Created admin user: username='{username}'")
    if generated:
        print(f"Generated password (shown once, save it now): {password}")
    else:
        print("Password set from DEFAULT_ADMIN_PASSWORD.")
    print("must_change_password is set, so this password must be changed on first login.")


with app.app_context():
    # Creates any table that doesn't already exist. If the schema file was already
    # imported, this is a no-op for every table. It never alters or drops an
    # existing table, so it's safe to run against either a bare or a pre-seeded DB.
    db.create_all()
    print("Tables created / verified.")
    seed_admin()
