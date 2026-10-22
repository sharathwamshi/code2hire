"""Role-centred admin API: Home (what needs attention), Roles (pipeline per job), universal
search (roles + skills + candidates + resume text), compare, export and bulk actions.

Pure read/aggregate layer on top of the existing tables, plus two small bulk actions that
call the same code the single-candidate buttons use. All the "where is this candidate"
logic lives in services/pipeline.py so every screen agrees."""
import csv
import io
import json
import re
from datetime import datetime

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import get_jwt_identity

from extensions import db
from models import (
    User, JobDescription, InterviewSession, InterviewConfig, SessionActionLog,
)
from routes.utils import role_required
from services import pipeline

hub_bp = Blueprint("hub", __name__, url_prefix="/api/admin")

FILTER_STAGES = set(pipeline.STAGE_ORDER)
MAX_ROLE_CANDIDATES_IN_SEARCH = 25


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _tokens(q):
    return [t for t in re.split(r"\s+", (q or "").strip().lower()) if t][:6]


def _like(token):
    esc = token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"


def _snippet(text, tokens, width=70):
    """A short excerpt of `text` around the first token that appears in it."""
    if not text:
        return None
    low = text.lower()
    best = None
    for t in tokens:
        i = low.find(t)
        if i != -1 and (best is None or i < best):
            best = i
    if best is None:
        return None
    start = max(0, best - width)
    end = min(len(text), best + width)
    snip = re.sub(r"\s+", " ", text[start:end]).strip()
    return ("..." if start > 0 else "") + snip + ("..." if end < len(text) else "")


def _role_text(jd):
    kp = jd.key_points or []
    kp_text = " ".join(kp if isinstance(kp, list) else [json.dumps(kp)])
    return {
        "title": (jd.title or "").lower(),
        "company": (jd.company or "").lower(),
        "skills": kp_text.lower(),
        "description": (jd.content or "").lower(),
    }


def _role_matches(jd, tokens):
    """Every token must hit somewhere in the role. Returns the list of fields hit, or None."""
    fields = _role_text(jd)
    hit = set()
    for t in tokens:
        found = [f for f, v in fields.items() if t in v]
        if not found:
            return None
        hit.update(found)
    order = ["title", "company", "skills", "description"]
    return [f for f in order if f in hit]


def _passes(state, f):
    if f.get("stage") and state["stage"] != f["stage"]:
        return False
    if f.get("mode") and state["mode"] != f["mode"]:
        return False
    if f.get("needs_review") and not (state["stage"] == "awaiting_review"):
        return False
    if f.get("has_recording") and not state["has_recording"]:
        return False
    if f.get("flagged") and not state["flagged"]:
        return False
    return True


def _filters():
    a = request.args
    stage = a.get("stage")
    mode = a.get("mode")
    return {
        "stage": stage if stage in FILTER_STAGES else None,
        "mode": mode if mode in ("practice", "real") else None,
        "needs_review": a.get("needs_review") in ("1", "true"),
        "has_recording": a.get("has_recording") in ("1", "true"),
        "flagged": a.get("flagged") in ("1", "true"),
    }


def _any_filter(f):
    return any(f.values())


def _role_card(jd, states):
    counts = pipeline.pipeline_counts(states)
    kp = jd.key_points or []
    return {
        "id": jd.id, "title": jd.title, "company": jd.company,
        "skills": list(kp)[:8] if isinstance(kp, list) else [],
        "total": len(states), "pipeline": counts,
        "awaiting_review": counts["awaiting_review"],
        "live": counts["live"],
        "created_at": jd.created_at.isoformat() if jd.created_at else None,
    }


def _states_by_role(jds=None):
    """{jd_id: [state, ...]} for every candidate that has a JD."""
    jd_ids = [j.id for j in jds] if jds is not None else None
    users = pipeline.candidates_for_roles(jd_ids)
    states = pipeline.build_states(users)
    by_role = {}
    for u in users:
        if u.jd_id is None:
            continue
        by_role.setdefault(u.jd_id, []).append(states[u.id])
    return by_role, states


# ---------------------------------------------------------------------------
# Home
# ---------------------------------------------------------------------------

@hub_bp.get("/home")
@role_required("admin")
def home():
    """What needs the admin's attention right now, plus counts for the sidebar badge."""
    users = pipeline.candidates_for_roles()
    states = pipeline.build_states(users)
    jds = {j.id: j for j in JobDescription.query.all()}

    attention = []
    for st in states.values():
        base = {"candidate_id": st["id"], "name": st["name"], "role_id": st["jd_id"], "role": st["jd_title"],
                "session_id": st["session_id"], "score": st["score"]}
        if st["stage"] == "awaiting_review":
            attention.append({**base, "kind": "review_report", "priority": 1,
                              "title": f"Review {st['name']}'s interview" if st["sub"] == "report_ready"
                              else f"Generate {st['name']}'s report",
                              "detail": st["blocker"], "action": st["action"]})
        elif st["stage"] == "questions" and st["sub"] == "needs_approval":
            attention.append({**base, "kind": "approve_questions", "priority": 2,
                              "title": f"Approve questions for {st['name']}",
                              "detail": st["blocker"], "action": st["action"]})
        elif st["stage"] == "live":
            attention.append({**base, "kind": "live_now", "priority": 0,
                              "title": f"{st['name']} is interviewing now" + (" (paused)" if st["paused"] else ""),
                              "detail": "Watch the interview live", "action": st["action"]})
        elif st["stage"] == "reviewed":
            attention.append({**base, "kind": "share_report", "priority": 3,
                              "title": f"Share {st['name']}'s report", "detail": "Reviewed - not yet shared with the candidate",
                              "action": st["action"]})
        elif st["stage"] == "profile":
            attention.append({**base, "kind": "add_resume", "priority": 4,
                              "title": f"Add a resume for {st['name']}", "detail": st["blocker"], "action": st["action"]})
    attention.sort(key=lambda a: (a["priority"], a["name"].lower()))

    by_stage = pipeline.pipeline_counts(states.values())
    counts = {
        "awaiting_review": by_stage["awaiting_review"],
        "questions_to_review": sum(1 for s in states.values() if s["stage"] == "questions" and s["sub"] == "needs_approval"),
        "live_now": by_stage["live"],
        "ready_to_share": by_stage["reviewed"],
        "roles": len(jds),
        "candidates": len(states),
    }
    counts["needs_attention"] = counts["awaiting_review"] + counts["questions_to_review"] + counts["ready_to_share"]

    recent = sorted(jds.values(), key=lambda j: j.updated_at or j.created_at or datetime.min, reverse=True)[:6]
    by_role, _ = _states_by_role(recent)
    return jsonify({
        "counts": counts,
        "attention": attention[:40],
        "recent_roles": [_role_card(j, by_role.get(j.id, [])) for j in recent],
        "pipeline": by_stage,
    })


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

@hub_bp.get("/roles")
@role_required("admin")
def list_roles():
    jds = JobDescription.query.order_by(JobDescription.created_at.desc()).all()
    by_role, _ = _states_by_role(jds)
    return jsonify([_role_card(j, by_role.get(j.id, [])) for j in jds])


@hub_bp.get("/roles/<int:jd_id>")
@role_required("admin")
def get_role(jd_id):
    jd = JobDescription.query.get_or_404(jd_id)
    by_role, _ = _states_by_role([jd])
    states = by_role.get(jd.id, [])
    data = _role_card(jd, states)
    data["content"] = jd.content
    data["candidates"] = states
    return jsonify(data)


@hub_bp.get("/roles/<int:jd_id>/export.csv")
@role_required("admin")
def export_role(jd_id):
    jd = JobDescription.query.get_or_404(jd_id)
    by_role, _ = _states_by_role([jd])
    states = by_role.get(jd.id, [])

    reviews = {}
    sids = [s["session_id"] for s in states if s["session_id"]]
    if sids:
        for sess in InterviewSession.query.filter(InterviewSession.id.in_(sids)).all():
            reviews[sess.id] = sess.review

    def safe(v):
        v = "" if v is None else str(v)
        # Spreadsheet formula injection: a cell starting with these is executed by Excel.
        return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Email", "Type", "Stage", "Attempts used", "Attempts allowed", "Score (0-5)",
                "AI verdict", "Review verdict", "Review note", "Reviewed by", "Flagged", "Recording", "Shared with candidate"])
    for s in states:
        rv = reviews.get(s["session_id"])
        w.writerow([
            safe(s["name"]), safe(s["email"]), "Practice" if s["mode"] == "practice" else "Real interview",
            s["stage_label"], s["attempts_used"], s["attempts_allowed"],
            "" if s["score"] is None else s["score"], safe(s["ai_verdict"]),
            safe(rv.verdict if rv else ""), safe(rv.note if rv else ""),
            safe((rv.reviewer.full_name or rv.reviewer.username) if rv and rv.reviewer else ""),
            "Yes" if s["flagged"] else "No", "Yes" if s["has_recording"] else "No", "Yes" if s["shared"] else "No",
        ])
    filename = re.sub(r"[^A-Za-z0-9_-]+", "_", jd.title or "role") + "_candidates.csv"
    return Response("﻿" + out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@hub_bp.post("/roles/<int:jd_id>/bulk")
@role_required("admin")
def bulk_role_action(jd_id):
    """Role-level bulk actions. Both only do what the single-candidate button would do, so
    the review gates still hold: nothing here can share an unreviewed report or approve questions."""
    from routes import admin as admin_routes  # local import: avoids a circular import at load time

    jd = JobDescription.query.get_or_404(jd_id)
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    users = [u for u in pipeline.candidates_for_roles([jd.id])]
    states = pipeline.build_states(users)
    admin_id = int(get_jwt_identity())

    if action == "generate_questions":
        started, skipped = [], []
        for u in users:
            st = states[u.id]
            if st["mode"] == "real" and st["stage"] == "questions" and st["sub"] in ("none", "failed"):
                payload, status = admin_routes.start_draft_generation(u)
                (started if status == 202 else skipped).append(u.id)
        return jsonify({"started": len(started), "skipped": len(skipped)})

    if action == "share_reviewed":
        verdicts = data.get("verdicts") or ["proceed"]
        verdicts = [v for v in verdicts if v in ("proceed", "hold", "reject", "re_interview")]
        shared, skipped = 0, 0
        for u in users:
            st = states[u.id]
            if st["stage"] != "reviewed" or st["review_verdict"] not in verdicts:
                skipped += 1
                continue
            sess = InterviewSession.query.get(st["session_id"])
            if not sess or not sess.report or sess.review is None:
                skipped += 1
                continue
            sess.report.shared_with_candidate = True
            sess.report.shared_at = datetime.utcnow()
            db.session.add(SessionActionLog(session_id=sess.id, action="share_report", actor_admin_id=admin_id,
                                            note="Report shared with the candidate (bulk)"))
            shared += 1
        db.session.commit()
        return jsonify({"shared": shared, "skipped": skipped})

    return jsonify({"error": "Unknown action. Use generate_questions or share_reviewed."}), 400


@hub_bp.get("/roles/<int:jd_id>/compare")
@role_required("admin")
def compare_candidates(jd_id):
    """Side-by-side of 2-4 candidates' latest completed, reported interview for one role."""
    JobDescription.query.get_or_404(jd_id)
    try:
        ids = [int(x) for x in (request.args.get("ids") or "").split(",") if x.strip()][:4]
    except ValueError:
        return jsonify({"error": "ids must be a comma-separated list of candidate ids."}), 400
    if len(ids) < 2:
        return jsonify({"error": "Pick at least two candidates to compare."}), 400

    rows = []
    for uid in ids:
        user = User.query.filter_by(id=uid, role="candidate", jd_id=jd_id).first()
        if not user:
            continue
        sess = (
            InterviewSession.query.filter_by(user_id=uid, jd_id=jd_id, status="completed")
            .order_by(InterviewSession.completed_at.desc(), InterviewSession.id.desc()).first()
        )
        rep = sess.report if sess else None
        summ = (rep.summary_json or {}) if rep else {}
        rows.append({
            "id": user.id, "name": user.full_name or user.username,
            "session_id": sess.id if sess else None,
            "has_report": rep is not None,
            "score": rep.overall_score if rep else None,
            "ai_verdict": rep.verdict if rep else None,
            "recommendation": rep.recommendation if rep else None,
            "review_verdict": sess.review.verdict if sess and sess.review else None,
            "strengths": (summ.get("key_strengths") or [])[:4],
            "improvements": (summ.get("areas_for_improvement") or [])[:4],
            "technical_skills": (summ.get("technical_skills") or [])[:5],
            "soft_skills": (summ.get("soft_skills") or [])[:3],
            "answered": sess.answered_count() if sess else 0,
            "planned": sess.planned_count() if sess and sess.mode == "ai" else None,
            "violations": sess.violation_count() if sess else 0,
        })
    return jsonify({"candidates": rows})


# ---------------------------------------------------------------------------
# Universal search
# ---------------------------------------------------------------------------

@hub_bp.get("/search")
@role_required("admin")
def universal_search():
    """One box for everything.

    - A word that appears in a role's title, company, required skills or description finds
      that ROLE, and the response carries that role's candidates with their pipeline stage.
    - A word that appears in a candidate's name, email, username or RESUME (so a skill such as
      "react" finds the people who list it) finds the CANDIDATE, with the matching resume excerpt.
    - stage / mode / needs_review / has_recording / flagged narrow the candidates in both blocks."""
    q = (request.args.get("q") or "").strip()
    tokens = _tokens(q)
    f = _filters()

    jds = JobDescription.query.order_by(JobDescription.updated_at.desc()).all()

    # ---- roles ----
    matched_roles = []
    if tokens:
        for jd in jds:
            hit = _role_matches(jd, tokens)
            if hit:
                matched_roles.append((jd, hit))
    else:
        matched_roles = [(jd, []) for jd in jds]

    # ---- candidates matching on their own fields (name/email/username/resume) ----
    direct = []
    if tokens:
        cols = (User.username, User.full_name, User.email, User.resume_text, User.resume_updated_text)
        query = User.query.filter_by(role="candidate")
        for t in tokens:
            like = _like(t)
            query = query.filter(db.or_(*[db.func.lower(c).like(like, escape="\\") for c in cols]))
        direct = query.order_by(User.created_at.desc()).limit(60).all()

    def _match_info(u):
        low = lambda v: (v or "").lower()
        if all(t in low(u.full_name) or t in low(u.username) or t in low(u.email) for t in tokens):
            return {"field": "name", "snippet": None}
        text = u.resume_text if any(t in low(u.resume_text) for t in tokens) else u.resume_updated_text
        return {"field": "resume", "snippet": _snippet(text, tokens)}

    direct_info = {u.id: _match_info(u) for u in direct} if tokens else {}

    role_ids = [jd.id for jd, _ in matched_roles]
    role_users = pipeline.candidates_for_roles(role_ids) if role_ids else []

    states = pipeline.build_states(list({u.id: u for u in (role_users + direct)}.values()))

    by_role = {}
    for u in role_users:
        by_role.setdefault(u.jd_id, []).append(states[u.id])

    roles_out = []
    for jd, hit in matched_roles:
        all_states = by_role.get(jd.id, [])
        cards = [({**s, "match": direct_info[s["id"]]} if s["id"] in direct_info else s) for s in all_states if _passes(s, f)]
        if not tokens and _any_filter(f) and not cards:
            continue
        card = _role_card(jd, all_states)
        card["matched"] = hit
        card["candidates"] = cards[:MAX_ROLE_CANDIDATES_IN_SEARCH]
        card["candidates_total"] = len(cards)
        roles_out.append(card)
    if not tokens:
        roles_out = roles_out[:8]

    cand_out = []
    for u in direct:
        st = states[u.id]
        if not _passes(st, f):
            continue
        cand_out.append({**st, "match": direct_info[u.id]})

    # With filters but no text, list the matching candidates straight away.
    if not tokens and _any_filter(f):
        all_users = pipeline.candidates_for_roles()
        all_states = pipeline.build_states(all_users)
        cand_out = [{**s, "match": {"field": "filter", "snippet": None}} for s in all_states.values() if _passes(s, f)][:60]

    return jsonify({"query": q, "tokens": tokens, "filters": f, "roles": roles_out, "candidates": cand_out})


# ---------------------------------------------------------------------------
# Candidates (global list with stage)
# ---------------------------------------------------------------------------

@hub_bp.get("/candidates")
@role_required("admin")
def list_candidates_with_stage():
    f = _filters()
    users = pipeline.candidates_for_roles()
    states = pipeline.build_states(users)
    rows = [states[u.id] for u in users if _passes(states[u.id], f)]
    return jsonify(rows)


@hub_bp.get("/candidates/<int:user_id>/state")
@role_required("admin")
def candidate_state(user_id):
    user = User.query.filter_by(id=user_id, role="candidate").first_or_404()
    return jsonify(pipeline.build_states([user])[user.id])
