import secrets
from datetime import datetime
from extensions import db


# =============================================================================
# ORIGINAL PLATFORM MODELS
# =============================================================================

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="candidate")  # admin | candidate
    full_name = db.Column(db.String(150), nullable=True)
    email = db.Column(db.String(150), nullable=True)

    training_level = db.Column(db.String(10), nullable=False, default="medium")  # low | medium | high
    active_stage = db.Column(db.String(10), nullable=False, default="prepare")  # prepare | interview

    jd_id = db.Column(db.Integer, db.ForeignKey("job_descriptions.id"), nullable=True)

    resume_filename = db.Column(db.String(255), nullable=True)
    resume_text = db.Column(db.Text, nullable=True)
    resume_updated_text = db.Column(db.Text, nullable=True)
    resume_updated_at = db.Column(db.DateTime, nullable=True)

    must_change_password = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    login_count = db.Column(db.Integer, default=0)
    total_time_seconds = db.Column(db.Integer, default=0)
    last_login_at = db.Column(db.DateTime, nullable=True)

    jd = db.relationship("JobDescription", back_populates="users")
    sessions = db.relationship("LoginSession", back_populates="user", cascade="all, delete-orphan")
    feedbacks = db.relationship("Feedback", back_populates="user", cascade="all, delete-orphan")
    prep_flows = db.relationship("PrepFlow", back_populates="user", cascade="all, delete-orphan")
    interview_sessions = db.relationship("InterviewSession", back_populates="user", cascade="all, delete-orphan")

    def avg_rating(self):
        vals = [f.self_rating for f in self.feedbacks if f.self_rating is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    def to_dict(self, include_resume=False):
        data = {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "training_level": self.training_level,
            "active_stage": self.active_stage,
            "jd_id": self.jd_id,
            "jd_title": self.jd.title if self.jd else None,
            "has_resume": bool(self.resume_text),
            "has_updated_resume": bool(self.resume_updated_text),
            "login_count": self.login_count,
            "total_time_seconds": self.total_time_seconds,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "avg_rating": self.avg_rating(),
            "must_change_password": self.must_change_password,
        }
        if include_resume:
            data["resume_text"] = self.resume_text
            data["resume_updated_text"] = self.resume_updated_text
        return data


class JobDescription(db.Model):
    __tablename__ = "job_descriptions"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    company = db.Column(db.String(150), nullable=True)
    content = db.Column(db.Text, nullable=False)
    key_points = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = db.relationship("User", back_populates="jd")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "company": self.company,
            "content": self.content,
            "key_points": self.key_points or [],
            "assigned_count": len(self.users),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class LoginSession(db.Model):
    __tablename__ = "login_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    login_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_heartbeat_at = db.Column(db.DateTime, default=datetime.utcnow)
    logout_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, default=0)

    user = db.relationship("User", back_populates="sessions")


class PrepFlow(db.Model):
    __tablename__ = "prep_flows"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    jd_id = db.Column(db.Integer, db.ForeignKey("job_descriptions.id"), nullable=False)

    status = db.Column(db.String(24), nullable=False, default="in_progress")
    error_message = db.Column(db.Text, nullable=True)
    total_topics = db.Column(db.Integer, nullable=False, default=0)

    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="prep_flows")
    stages = db.relationship(
        "PrepFlowStage", back_populates="prep_flow", cascade="all, delete-orphan",
        order_by="PrepFlowStage.seq",
    )

    def to_flow_dict(self):
        topics = [s.payload for s in self.stages if s.stage_type == "topic"]
        project_stage = next((s for s in self.stages if s.stage_type == "project"), None)
        tips_stage = next((s for s in self.stages if s.stage_type == "tips"), None)
        return {
            "topics": topics,
            "project_questions": project_stage.payload if project_stage else [],
            "prep_tips": tips_stage.payload if tips_stage else [],
        }

    def to_dict(self):
        topics_done = sum(1 for s in self.stages if s.stage_type == "topic")
        return {
            "id": self.id,
            "jd_id": self.jd_id,
            "status": self.status,
            "error_message": self.error_message,
            "total_topics": self.total_topics,
            "topics_done": topics_done,
            "flow": self.to_flow_dict(),
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class PrepFlowStage(db.Model):
    __tablename__ = "prep_flow_stages"

    id = db.Column(db.Integer, primary_key=True)
    prep_flow_id = db.Column(db.Integer, db.ForeignKey("prep_flows.id"), nullable=False)
    stage_type = db.Column(db.String(20), nullable=False)
    seq = db.Column(db.Integer, nullable=False, default=0)
    payload = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    prep_flow = db.relationship("PrepFlow", back_populates="stages")


class Feedback(db.Model):
    __tablename__ = "feedback"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    topic = db.Column(db.String(255), nullable=False)
    self_rating = db.Column(db.Integer, nullable=False)
    comments = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="feedbacks")

    def to_dict(self):
        return {
            "id": self.id, "topic": self.topic, "self_rating": self.self_rating,
            "comments": self.comments,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Setting(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)

    @staticmethod
    def get(key, default=None):
        row = Setting.query.filter_by(key=key).first()
        return row.value if row else default

    @staticmethod
    def set(key, value):
        row = Setting.query.filter_by(key=key).first()
        if row:
            row.value = value
        else:
            row = Setting(key=key, value=value)
            db.session.add(row)
        db.session.commit()
        return row

    @staticmethod
    def delete(key):
        row = Setting.query.filter_by(key=key).first()
        if row:
            db.session.delete(row)
            db.session.commit()
            return True
        return False


# =============================================================================
# INTERVIEW MODULE MODELS
# =============================================================================

class InterviewConfig(db.Model):
    __tablename__ = "interview_configs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)

    mode = db.Column(db.String(10), nullable=False, default="ai")  # ai | live
    difficulty = db.Column(db.String(10), nullable=False, default="medium")
    voice_enabled = db.Column(db.Boolean, default=True)
    voice_id = db.Column(db.String(100), nullable=True)
    max_questions = db.Column(db.Integer, default=12)
    skill_tags = db.Column(db.JSON, nullable=True)

    violation_threshold = db.Column(db.Integer, default=1)
    require_fullscreen = db.Column(db.Boolean, default=True)

    # How many completed "ai" attempts this candidate may have in total. Defaults to a
    # single attempt; an admin increments this via the "Reopen interview" action to grant
    # exactly one more, rather than letting the candidate self-serve unlimited retakes.
    attempts_allowed = db.Column(db.Integer, nullable=False, default=1, server_default=db.text("1"))

    interviewer_name = db.Column(db.String(150), nullable=True)
    link_token = db.Column(db.String(64), nullable=True, unique=True)
    link_expires_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "mode": self.mode,
            "difficulty": self.difficulty,
            "voice_enabled": self.voice_enabled,
            "voice_id": self.voice_id,
            "max_questions": self.max_questions,
            "skill_tags": self.skill_tags or [],
            "violation_threshold": self.violation_threshold,
            "require_fullscreen": self.require_fullscreen,
            "attempts_allowed": self.attempts_allowed,
            "interviewer_name": self.interviewer_name,
            "link_token": self.link_token,
            "link_expires_at": self.link_expires_at.isoformat() if self.link_expires_at else None,
        }

    @staticmethod
    def generate_token():
        return secrets.token_urlsafe(24)


# Events that are logged and reported to the admin but never pause the interview
# and never count towards the violation total (they happen constantly and are
# usually harmless — e.g. clicking the address bar or another window).
NON_BLOCKING_EVENT_TYPES = {"window_blur"}


class InterviewSession(db.Model):
    __tablename__ = "interview_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    jd_id = db.Column(db.Integer, db.ForeignKey("job_descriptions.id"), nullable=False)
    config_id = db.Column(db.Integer, db.ForeignKey("interview_configs.id"), nullable=True)

    mode = db.Column(db.String(10), nullable=False, default="ai")
    difficulty = db.Column(db.String(10), nullable=False, default="medium")

    status = db.Column(db.String(20), nullable=False, default="not_started")
    # not_started | in_progress | paused | completed | restarted | abandoned

    current_seq = db.Column(db.Integer, default=0)
    question_count = db.Column(db.Integer, default=0)

    draft_id = db.Column(db.Integer, db.ForeignKey("interview_drafts.id"), nullable=True)
    draft_step = db.Column(db.Integer, default=0)

    started_at = db.Column(db.DateTime, nullable=True)
    paused_at = db.Column(db.DateTime, nullable=True)
    pause_reason = db.Column(db.String(20), nullable=True)
    # violation | candidate_stop — why the session is currently paused
    end_reason = db.Column(db.String(20), nullable=True)
    # candidate_exit | NULL — set when the candidate chose to end the interview early
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    recording_path = db.Column(db.String(500), nullable=True)

    user = db.relationship("User", back_populates="interview_sessions")
    jd = db.relationship("JobDescription")
    draft = db.relationship("InterviewDraft")
    turns = db.relationship(
        "InterviewTurn", back_populates="session", cascade="all, delete-orphan",
        order_by="InterviewTurn.seq",
    )
    violations = db.relationship(
        "IntegrityEvent", back_populates="session", cascade="all, delete-orphan",
        order_by="IntegrityEvent.occurred_at",
    )
    action_logs = db.relationship(
        "SessionActionLog", back_populates="session", cascade="all, delete-orphan",
        order_by="SessionActionLog.created_at",
    )
    report = db.relationship("InterviewReport", back_populates="session", uselist=False, cascade="all, delete-orphan")

    def violation_count(self):
        return len([v for v in self.violations if v.event_type not in NON_BLOCKING_EVENT_TYPES])

    def answered_count(self):
        return InterviewTurn.query.filter_by(session_id=self.id, role="candidate").count()

    def planned_count(self):
        """How many questions this interview was going to ask (None when unknown, e.g. live calls)."""
        if self.draft and self.draft.questions_json:
            return len(self.draft.questions_json)
        cfg = InterviewConfig.query.get(self.config_id) if self.config_id else None
        return cfg.max_questions if cfg and cfg.max_questions else None

    def completion_note(self):
        """Context handed to the report generator when the interview did not run to its end."""
        if self.end_reason != "candidate_exit":
            return None
        planned = self.planned_count()
        of = f" of {planned}" if planned else ""
        return (
            f"The candidate ended this interview early, after answering {self.answered_count()}{of} planned "
            "question(s). Judge only what was actually answered, and say plainly in the narrative that the "
            "interview was incomplete."
        )

    def notice_count(self):
        return len([v for v in self.violations if v.event_type in NON_BLOCKING_EVENT_TYPES])

    def to_dict(self, include_turns=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "candidate_name": self.user.full_name or self.user.username if self.user else None,
            "jd_id": self.jd_id,
            "jd_title": self.jd.title if self.jd else None,
            "mode": self.mode,
            "difficulty": self.difficulty,
            "status": self.status,
            "current_seq": self.current_seq,
            "question_count": self.question_count,
            "violation_count": self.violation_count(),
            "notice_count": self.notice_count(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
            "pause_reason": self.pause_reason,
            "end_reason": self.end_reason,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "has_report": self.report is not None,
            "recording_path": bool(self.recording_path),
        }
        if include_turns:
            data["answered_count"] = self.answered_count()
            data["planned_count"] = self.planned_count() if self.mode == "ai" else None
            data["turns"] = [t.to_dict() for t in self.turns]
            data["violations"] = [v.to_dict() for v in self.violations]
            data["action_logs"] = [a.to_dict() for a in self.action_logs]
        return data


class InterviewTurn(db.Model):
    __tablename__ = "interview_turns"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("interview_sessions.id"), nullable=False)
    seq = db.Column(db.Integer, nullable=False)
    role = db.Column(db.String(12), nullable=False)  # ai | candidate | system
    content = db.Column(db.Text, nullable=False)
    topic = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    session = db.relationship("InterviewSession", back_populates="turns")

    def to_dict(self):
        return {
            "id": self.id, "seq": self.seq, "role": self.role, "content": self.content,
            "topic": self.topic, "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class IntegrityEvent(db.Model):
    __tablename__ = "integrity_events"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("interview_sessions.id"), nullable=False)
    event_type = db.Column(db.String(30), nullable=False)
    severity = db.Column(db.String(10), nullable=False, default="medium")
    active_question_seq = db.Column(db.Integer, nullable=True)
    occurred_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved = db.Column(db.Boolean, default=False)

    session = db.relationship("InterviewSession", back_populates="violations")

    def to_dict(self):
        return {
            "id": self.id, "event_type": self.event_type, "severity": self.severity,
            "active_question_seq": self.active_question_seq,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "resolved": self.resolved,
        }


class SessionActionLog(db.Model):
    __tablename__ = "session_action_logs"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("interview_sessions.id"), nullable=False)
    action = db.Column(db.String(20), nullable=False)  # pause | resume | restart | manual_pause
    actor_admin_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    session = db.relationship("InterviewSession", back_populates="action_logs")
    actor = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id, "action": self.action,
            "actor_name": self.actor.full_name or self.actor.username if self.actor else "System",
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class InterviewReport(db.Model):
    __tablename__ = "interview_reports"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("interview_sessions.id"), nullable=False, unique=True)

    overall_score = db.Column(db.Float, nullable=True)
    verdict = db.Column(db.String(30), nullable=True)
    recommendation = db.Column(db.String(20), nullable=True)

    summary_json = db.Column(db.JSON, nullable=True)
    qna_json = db.Column(db.JSON, nullable=True)

    generated_at = db.Column(db.DateTime, default=datetime.utcnow)

    # A report is for the admin's eyes only until the admin explicitly shares it.
    shared_with_candidate = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("0"))
    shared_at = db.Column(db.DateTime, nullable=True)

    session = db.relationship("InterviewSession", back_populates="report")

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "overall_score": self.overall_score,
            "verdict": self.verdict,
            "recommendation": self.recommendation,
            "summary": self.summary_json or {},
            "qna": self.qna_json or [],
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "shared_with_candidate": bool(self.shared_with_candidate),
            "shared_at": self.shared_at.isoformat() if self.shared_at else None,
        }


class InterviewDraft(db.Model):
    """A pre-generated, admin-reviewed set of interview questions for a
    candidate+JD pair. Generated once in the background, reviewed and edited
    by the admin, then approved. Once approved, the candidate's live AI
    interview serves these questions directly instead of generating each
    turn live — removing per-turn Anthropic latency from their session."""
    __tablename__ = "interview_drafts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    jd_id = db.Column(db.Integer, db.ForeignKey("job_descriptions.id"), nullable=False)
    difficulty = db.Column(db.String(10), nullable=False, default="medium")

    status = db.Column(db.String(20), nullable=False, default="generating")
    # generating | ready | approved | failed
    error_message = db.Column(db.Text, nullable=True)
    total_topics = db.Column(db.Integer, nullable=False, default=0)

    questions_json = db.Column(db.JSON, nullable=True)
    # [{ seq, jd_point, found_in_resume, evidence_from_resume, opening_question,
    #    follow_up_question, edited }]

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    approved_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User")
    jd = db.relationship("JobDescription")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "jd_id": self.jd_id,
            "difficulty": self.difficulty,
            "status": self.status,
            "error_message": self.error_message,
            "total_topics": self.total_topics,
            "questions_done": len(self.questions_json or []),
            "questions": self.questions_json or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(30), nullable=False)  # violation | interview_completed | interview_paused
    message = db.Column(db.String(500), nullable=False)
    session_id = db.Column(db.Integer, db.ForeignKey("interview_sessions.id"), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "type": self.type, "message": self.message,
            "session_id": self.session_id, "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
