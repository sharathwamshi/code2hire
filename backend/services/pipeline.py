"""Where is each candidate in the hiring pipeline?

One place that turns the raw rows (user, interview config, question draft, interview
sessions, report, review) into a single stage plus the one thing an admin should do next.
Everything the admin UI shows about "status" comes from here, so the dashboard, the role
board, the search results and the candidate page can never disagree.

Stages (a Real interview moves left to right; each arrow past `questions` and
`awaiting_review` is a mandatory human review gate):

    profile -> questions -> ready -> live -> awaiting_review -> reviewed -> shared

Practice candidates (track == "practice") sit in `practice` once their profile is complete.
"""
from sqlalchemy.orm import selectinload

from extensions import db
from models import (
    User, InterviewConfig, InterviewDraft, InterviewSession, PrepFlow,
)

STAGE_ORDER = ["profile", "practice", "questions", "ready", "live", "awaiting_review", "reviewed", "shared"]

STAGE_LABELS = {
    "profile": "Profile incomplete",
    "practice": "Practice",
    "questions": "Questions",
    "ready": "Ready to interview",
    "live": "Interview in progress",
    "awaiting_review": "Awaiting review",
    "reviewed": "Reviewed",
    "shared": "Shared",
}


def _action(kind, label, enabled=True):
    return {"type": kind, "label": label, "enabled": enabled}


def _latest_completed(sessions):
    done = [s for s in sessions if s.status == "completed"]
    if not done:
        return None
    return max(done, key=lambda s: (s.completed_at or s.created_at, s.id))


def _state_for(user, config, drafts, sessions, prep):
    """drafts/sessions are already limited to the user's current JD."""
    mode = "real" if (user.track or "practice") == "interview" else "practice"
    ai_sessions = [s for s in sessions if s.mode == "ai"]
    attempts_allowed = (config.attempts_allowed or 1) if config else 1
    completed = [s for s in ai_sessions if s.status == "completed"]
    attempts_used = len(completed)

    approved = next((d for d in drafts if d.status == "approved"), None)
    latest_draft = drafts[0] if drafts else None

    state = {
        "id": user.id,
        "name": user.full_name or user.username,
        "username": user.username,
        "email": user.email,
        "jd_id": user.jd_id,
        "jd_title": user.jd.title if user.jd else None,
        "mode": mode,
        "interview_mode": config.mode if config else "ai",
        "attempts_used": attempts_used,
        "attempts_allowed": attempts_allowed,
        "attempts_left": max(0, attempts_allowed - attempts_used),
        "has_resume": bool(user.resume_text),
        "access": user.active_stage,
        "stage": None, "stage_label": None, "sub": None, "blocker": None, "action": None,
        "session_id": None, "score": None, "ai_verdict": None, "review_verdict": None,
        "has_recording": False, "flagged": False, "violations": 0, "paused": False,
        "shared": False, "questions_status": latest_draft.status if latest_draft else "none",
        "last_activity": None,
    }

    latest_session = max(sessions, key=lambda s: (s.created_at, s.id)) if sessions else None
    acts = [x for x in (user.last_login_at,) if x]
    for s in sessions:
        acts += [x for x in (s.completed_at, s.started_at) if x]
    state["last_activity"] = max(acts).isoformat() if acts else None

    # ---- profile gate -----------------------------------------------------------------
    if not user.resume_text:
        state.update(stage="profile", sub="no_resume", blocker="Add a resume to continue",
                     action=_action("add_resume", "Add resume"))
        return _finish(state)

    # ---- practice ---------------------------------------------------------------------
    if mode == "practice":
        sub = "not_started"
        if prep is not None:
            sub = "ready" if prep.status in ("completed", "ready") else prep.status
        state.update(stage="practice", sub=sub, action=_action("open_candidate", "Open candidate"))
        return _finish(state)

    # ---- real interview ---------------------------------------------------------------
    live = next((s for s in sorted(ai_sessions + [s for s in sessions if s.mode != "ai"],
                                   key=lambda s: s.created_at, reverse=True)
                 if s.status in ("in_progress", "paused")), None)
    if live is not None:
        state.update(stage="live", sub=live.status, session_id=live.id, paused=live.status == "paused",
                     flagged=live.violation_count() > 0, violations=live.violation_count(),
                     has_recording=bool(live.recording_path),
                     action=_action("watch_live", "Watch live"))
        return _finish(state)

    last_done = _latest_completed(sessions)
    if last_done is not None:
        review = last_done.review
        report = last_done.report
        state.update(
            session_id=last_done.id, flagged=last_done.violation_count() > 0,
            violations=last_done.violation_count(), has_recording=bool(last_done.recording_path),
            score=report.overall_score if report else None, ai_verdict=report.verdict if report else None,
            review_verdict=review.verdict if review else None,
            shared=bool(report and report.shared_with_candidate),
        )
        if review is None:
            if report is None:
                state.update(stage="awaiting_review", sub="no_report",
                             blocker="Generate the report, then review it",
                             action=_action("generate_report", "Generate report"))
            else:
                state.update(stage="awaiting_review", sub="report_ready",
                             blocker="Review the report to unlock sharing",
                             action=_action("review_report", "Review report"))
            return _finish(state)
        if review.verdict == "re_interview" and attempts_used < attempts_allowed:
            state.update(stage="ready", sub="re_interview", action=_action("copy_invite", "Copy invite"))
            return _finish(state)
        if state["shared"]:
            state.update(stage="shared", action=_action("view_report", "View report"))
        else:
            state.update(stage="reviewed", blocker="Share the report when you are ready",
                         action=_action("share_report", "Share report"))
        return _finish(state)

    # ---- no interview yet: the question gate -------------------------------------------
    if config is not None and config.mode == "live":
        state.update(stage="ready", sub="live_call", action=_action("copy_invite", "Copy invite"))
        return _finish(state)
    if approved is not None:
        state.update(stage="ready", sub="approved", action=_action("copy_invite", "Copy invite"))
        return _finish(state)
    if latest_draft is None or latest_draft.status == "failed":
        sub = "failed" if latest_draft is not None else "none"
        state.update(stage="questions", sub=sub, blocker="Generate and approve the questions to unlock the interview",
                     action=_action("generate_questions", "Generate questions"))
    elif latest_draft.status == "generating":
        state.update(stage="questions", sub="generating", blocker="Questions are being generated",
                     action=_action("review_questions", "Generating...", enabled=False))
    else:  # ready (not yet approved)
        state.update(stage="questions", sub="needs_approval", blocker="Approve the questions to unlock the interview",
                     action=_action("review_questions", "Review questions"))
    return _finish(state)


def _finish(state):
    state["stage_label"] = STAGE_LABELS[state["stage"]]
    state["needs_attention"] = (
        state["stage"] == "awaiting_review"
        or (state["stage"] == "questions" and state["sub"] == "needs_approval")
        or state["stage"] == "reviewed"
    )
    return state


def build_states(users):
    """Batch-load everything needed and return {user_id: state}. Avoids per-candidate queries."""
    users = [u for u in users if u is not None]
    if not users:
        return {}
    ids = [u.id for u in users]

    configs = {c.user_id: c for c in InterviewConfig.query.filter(InterviewConfig.user_id.in_(ids)).all()}

    drafts_by_user = {}
    for d in InterviewDraft.query.filter(InterviewDraft.user_id.in_(ids)).order_by(InterviewDraft.created_at.desc(), InterviewDraft.id.desc()).all():
        drafts_by_user.setdefault(d.user_id, []).append(d)

    sessions_by_user = {}
    q = (
        InterviewSession.query
        .filter(InterviewSession.user_id.in_(ids), InterviewSession.status.notin_(["restarted", "not_started"]))
        .options(selectinload(InterviewSession.report), selectinload(InterviewSession.review),
                 selectinload(InterviewSession.violations))
    )
    for s in q.all():
        sessions_by_user.setdefault(s.user_id, []).append(s)

    prep_by_user = {}
    for p in PrepFlow.query.filter(PrepFlow.user_id.in_(ids)).order_by(PrepFlow.generated_at.desc(), PrepFlow.id.desc()).all():
        prep_by_user.setdefault(p.user_id, p)

    out = {}
    for u in users:
        drafts = [d for d in drafts_by_user.get(u.id, []) if d.jd_id == u.jd_id]
        sessions = [s for s in sessions_by_user.get(u.id, []) if s.jd_id == u.jd_id]
        out[u.id] = _state_for(u, configs.get(u.id), drafts, sessions, prep_by_user.get(u.id))
    return out


def pipeline_counts(states):
    counts = {k: 0 for k in STAGE_ORDER}
    for s in states:
        counts[s["stage"]] += 1
    return counts


def candidates_for_roles(jd_ids=None):
    q = User.query.filter_by(role="candidate")
    if jd_ids is not None:
        q = q.filter(User.jd_id.in_(jd_ids))
    return q.order_by(User.created_at.desc()).all()
