"""
Wraps all calls to the Anthropic API used by the platform.
The API key is resolved at call time: Admin > Settings value (stored in DB)
takes priority over the ANTHROPIC_API_KEY environment variable.
"""
import json
import os
import re

import anthropic
from flask import current_app

from models import Setting
from services.answer_signals import is_brief_give_up, strip_greeting

DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def get_active_api_key():
    try:
        db_key = Setting.get("anthropic_api_key")
    except Exception:
        db_key = None
    return db_key or current_app.config.get("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")


def get_active_model():
    try:
        db_model = Setting.get("anthropic_model")
    except Exception:
        db_model = None
    return db_model or current_app.config.get("ANTHROPIC_MODEL") or DEFAULT_MODEL


def _client():
    api_key = get_active_api_key()
    if not api_key:
        raise RuntimeError(
            "No Anthropic API key configured. Set ANTHROPIC_API_KEY in the backend .env, "
            "or add it from Admin > Settings."
        )
    return anthropic.Anthropic(api_key=api_key)


def _extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text.strip())
    text = re.sub(r"```$", "", text.strip())
    text = text.strip()

    candidates = [text]
    match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if match:
        candidates.append(match.group(1))

    last_err = None
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as e:
            last_err = e
            # Common LLM slip: a trailing comma before a closing } or ]
            repaired = re.sub(r",(\s*[\}\]])", r"\1", candidate)
            if repaired != candidate:
                try:
                    return json.loads(repaired)
                except json.JSONDecodeError as e2:
                    last_err = e2

    raise ValueError(f"Could not parse JSON from model response: {last_err}")


def _messages_create(system, user_content, max_tokens=4000, timeout=None):
    client = _client()
    kwargs = {"timeout": timeout} if timeout else {}
    resp = client.messages.create(
        model=get_active_model(),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
        **kwargs,
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# JD key point extraction
# ---------------------------------------------------------------------------

def extract_jd_key_points(jd_content: str):
    system = (
        "You are a technical recruiter assistant. You break a job description into a clean list "
        "of distinct, individually-checkable requirement points (skills, tools, years of experience, "
        "domain knowledge, responsibilities). Respond with ONLY a JSON array of short strings, "
        "no preamble, no markdown fences."
    )
    user_content = f"Job description:\n\n{jd_content}\n\nExtract 6-14 distinct requirement points."
    raw = _messages_create(system, user_content, max_tokens=1200)
    points = _extract_json(raw)
    if not isinstance(points, list):
        raise ValueError("Expected a JSON array of key points")
    return [str(p).strip() for p in points if str(p).strip()]


# ---------------------------------------------------------------------------
# Staged prep-flow generation (Prepare page)
# ---------------------------------------------------------------------------

STAGE_CONTEXT = """You are simulating how an AI interviewer structures a real candidate interview, \
so a candidate can prepare for it in advance.

Real interview behaviour, which you must replicate:
- It works through the job description point by point.
- For each JD point, it first checks whether the resume already shows evidence of it.
  - If the resume DOES show evidence, it opens by referencing that evidence directly and asks a \
pointed follow-up that goes deeper into what the candidate actually did.
  - If the resume does NOT show evidence, it asks a broader opening question to establish whether \
the candidate has any relevant experience at all.
- Whatever answer the candidate gives, the next question digs deeper along that specific thread \
(a strong, detailed answer earns a harder follow-up; a vague or shallow answer earns a clarifying \
question; a "no experience" answer moves to a related but more fundamental question).
- Separately, it picks concrete projects mentioned in the resume that are similar in nature to \
the role being hired for, and asks project-based questions such as "what were the challenges you \
faced" or "how did you solve X" or "what would you do differently."

Ground everything in the RESUME and JOB DESCRIPTION given below. Never invent facts, tools, or \
employers not present in the resume."""


TOPIC_SYSTEM_PROMPT = STAGE_CONTEXT + """

Your job right now: produce the prep-tree entry for exactly ONE job-description requirement point, \
given below. Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:

{
  "id": "t<index>",
  "jd_point": "<the JD requirement>",
  "found_in_resume": true,
  "evidence_from_resume": "<short quote/paraphrase of the relevant resume line, or null>",
  "opening_question": "<the question likely to open with for this point>",
  "answer_paths": [
    {"path_label": "Strong / detailed answer", "example_answer": "<a strong sample answer grounded in the resume>", "follow_up_question": "<the harder question asked next>"},
    {"path_label": "Vague / surface-level answer", "example_answer": "<a shallower sample answer>", "follow_up_question": "<the clarifying question asked next>"},
    {"path_label": "No direct experience", "example_answer": "<how to honestly bridge the gap>", "follow_up_question": "<the more fundamental question asked next>"}
  ]
}

Keep each example_answer to 2-4 sentences. Adjust sharpness of follow-ups to the difficulty level."""


def generate_topic_stage(resume_text: str, jd_content: str, jd_point: str, training_level: str, index: int):
    user_content = (
        f"DIFFICULTY LEVEL: {training_level}\n\nJOB DESCRIPTION:\n{jd_content}\n\n"
        f"THE ONE REQUIREMENT POINT TO COVER NOW:\n{jd_point}\n\nCANDIDATE RESUME:\n{resume_text}\n\n"
        f"Generate the JSON for this single topic now, using id \"t{index}\"."
    )
    raw = _messages_create(TOPIC_SYSTEM_PROMPT, user_content, max_tokens=900)
    topic = _extract_json(raw)
    topic.setdefault("id", f"t{index}")
    return topic


PROJECT_SYSTEM_PROMPT = STAGE_CONTEXT + """

Your job right now: pick 2-3 concrete projects mentioned in the resume that are similar in nature \
to the job description's needs, and write project-based interview questions for them. Respond with \
ONLY a valid JSON array (no markdown fences, no commentary) matching exactly:

[{"id": "p1", "project_name": "<project name from resume>", "why_relevant": "<why this project fits the JD>",
  "question": "What were the biggest challenges you faced while building <project>, and how did you solve them?",
  "probable_answer_points": ["<bullet>", "..."], "likely_follow_ups": ["<follow-up 1>", "<follow-up 2>"]}]

Only use projects genuinely present in the resume. If none, return an empty array []."""


def generate_project_stage(resume_text: str, jd_content: str, training_level: str):
    user_content = (
        f"DIFFICULTY LEVEL: {training_level}\n\nJOB DESCRIPTION:\n{jd_content}\n\n"
        f"CANDIDATE RESUME:\n{resume_text}\n\nGenerate the project_questions JSON array now."
    )
    raw = _messages_create(PROJECT_SYSTEM_PROMPT, user_content, max_tokens=1500)
    projects = _extract_json(raw)
    return projects if isinstance(projects, list) else []


TIPS_SYSTEM_PROMPT = STAGE_CONTEXT + """

Your job right now: write 3-5 short, high-value preparation tips specific to this candidate and this \
JD (not generic interview advice). Respond with ONLY a valid JSON array of strings, no markdown \
fences, no commentary."""


def generate_tips_stage(resume_text: str, jd_content: str, training_level: str):
    user_content = (
        f"DIFFICULTY LEVEL: {training_level}\n\nJOB DESCRIPTION:\n{jd_content}\n\n"
        f"CANDIDATE RESUME:\n{resume_text}\n\nGenerate the prep_tips JSON array now."
    )
    raw = _messages_create(TIPS_SYSTEM_PROMPT, user_content, max_tokens=500)
    tips = _extract_json(raw)
    return tips if isinstance(tips, list) else []


# ---------------------------------------------------------------------------
# Resume tailoring
# ---------------------------------------------------------------------------

RESUME_SYSTEM_PROMPT = """You are a professional resume editor. You improve how an EXISTING resume \
is presented so that it is better streamlined for a specific job description, WITHOUT inventing new \
employers, titles, tools, metrics, or projects that are not already present in the source resume.

You may reorder/re-emphasize bullets, rewrite for crispness, tighten wording, align terminology with \
the JD's language where the underlying fact is the same, and surface already-mentioned relevant skills.
You may NOT add employers, titles, tools, or projects not already present, or invent metrics.

Return ONLY the improved resume as clean plain text (no markdown fences, no commentary), preserving \
standard resume section structure."""


def improve_resume(resume_text: str, jd_content: str):
    user_content = (
        f"JOB DESCRIPTION TO TAILOR FOR:\n{jd_content}\n\nCURRENT RESUME:\n{resume_text}\n\n"
        "Produce the improved, streamlined resume now."
    )
    improved = _messages_create(RESUME_SYSTEM_PROMPT, user_content, max_tokens=3000)
    return improved.strip()


# ---------------------------------------------------------------------------
# MODULE A: Live AI-conducted interview — turn-by-turn question generation
# ---------------------------------------------------------------------------

INTERVIEW_SYSTEM_PROMPT = """You are "Octo", an AI interviewer conducting a REAL, LIVE interview \
with a candidate for a specific role — not a prep exercise. You ask one question at a time and react \
to the candidate's actual answer, exactly like the transcript style below:

- Greet the candidate by name once at the very start, state the role, then ask your first question.
- Work through the job description's key requirement points one by one, checking the resume for \
evidence first, the same way a skilled human interviewer would.
- After each candidate answer, ask a natural, specific follow-up that reacts to what they actually \
said — go deeper on strong answers, clarify vague ones, and pivot to more fundamental ground when \
the candidate shows no experience on a topic.
- If the candidate goes off-topic, gently and briefly redirect them back to the interview, then \
re-ask or continue the flow (e.g. "Let's stay focused on the interview. Please answer...").
- Keep questions to ONE at a time, concise, and natural — never ask two things at once.
- After enough ground has been covered (you'll be told how many questions remain), wrap up warmly \
and let the candidate know the interview is complete.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:
{
  "message": "<what Octo says now — greeting+question, follow-up, redirect, or closing>",
  "topic": "<short label for what this turn is about, e.g. '.NET Core', 'React state management', 'closing'>",
  "is_closing": false
}
Set "is_closing": true only on the final wrap-up message where the interview formally ends."""


def generate_next_interview_message(
    candidate_name: str, resume_text: str, jd_content: str, jd_key_points,
    difficulty: str, transcript, questions_asked: int, max_questions: int,
):
    """transcript: list of {role, content} for the conversation so far (role: ai|candidate|system)."""
    key_points_block = "\n".join(f"- {p}" for p in (jd_key_points or []))
    transcript_block = "\n".join(f"{t['role'].upper()}: {t['content']}" for t in transcript) or "(interview has not started yet)"
    remaining = max(0, max_questions - questions_asked)

    user_content = (
        f"CANDIDATE NAME: {candidate_name}\n"
        f"DIFFICULTY LEVEL: {difficulty}\n\n"
        f"JOB DESCRIPTION:\n{jd_content}\n\n"
        f"JD KEY POINTS:\n{key_points_block}\n\n"
        f"CANDIDATE RESUME:\n{resume_text}\n\n"
        f"QUESTIONS ASKED SO FAR: {questions_asked} / {max_questions} (about {remaining} remaining)\n\n"
        f"CONVERSATION SO FAR:\n{transcript_block}\n\n"
        "Generate Octo's next message now, as JSON."
    )
    raw = _messages_create(INTERVIEW_SYSTEM_PROMPT, user_content, max_tokens=700)
    return _extract_json(raw)


# ---------------------------------------------------------------------------
# Adaptive follow-up: analyse the candidate's answer, then ask about it
# ---------------------------------------------------------------------------

FOLLOWUP_SYSTEM_PROMPT = """You are "Octo", an AI interviewer in a REAL, LIVE interview. The candidate \
has just answered the opening question for one topic. Your job has two steps: first ANALYSE what they \
actually said, then write exactly ONE follow-up question that is driven by that analysis.

Step 1 - analyse (be honest, judge only the words the candidate actually used):
- quality: "strong" (specific, correct, shows real experience), "partial" (some substance but vague, \
incomplete or missing the important part), "weak" (little or no substance, or incorrect), or \
"off_topic" (does not address the question).
- covered: short list of what the answer genuinely demonstrated.
- gaps: short list of what was missing, vague, or wrong.

Step 2 - the follow-up question:
- It MUST build on something specific the candidate said (a tool, a decision, a number, a term, a claim) \
- refer to that detail so it is obvious you listened.
- strong answer -> go deeper: a trade-off, a failure case, scale/edge case, or "why this and not X".
- partial answer -> probe the exact gap or the vaguest claim.
- weak answer -> step back to a simpler, more fundamental angle on the same topic.
- off_topic -> briefly and politely steer back, then ask a simpler on-topic question.
- It MUST NOT repeat, rephrase, or overlap with any question already asked (the list is provided) and it \
must approach the topic from a different angle than the opening question.
- ONE question only, natural spoken English (it will be read aloud), at most about 40 words, no lists, \
no markdown, no praise or filler such as "Great answer".

Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "analysis": {"quality": "partial", "covered": ["..."], "gaps": ["..."]},
  "follow_up_question": "<the single follow-up question>"
}"""


def generate_followup_question(
    candidate_name: str, jd_title: str, topic: str, resume_evidence, difficulty: str,
    opening_question: str, candidate_answer: str, questions_asked,
):
    """Reviews the candidate's answer to an opening question and returns
    {"analysis": {...}, "follow_up_question": "..."}. Uses a short timeout so a slow
    API call never leaves the candidate waiting; the caller falls back to the
    pre-generated follow-up on any failure."""
    asked_block = "\n".join(f"- {q}" for q in (questions_asked or [])) or "(none yet)"
    evidence = resume_evidence or "No direct evidence for this topic was found on the resume."
    user_content = (
        f"CANDIDATE NAME: {candidate_name}\n"
        f"ROLE: {jd_title}\n"
        f"DIFFICULTY LEVEL: {difficulty}\n"
        f"TOPIC: {topic}\n"
        f"RESUME EVIDENCE FOR THIS TOPIC: {evidence}\n\n"
        f"QUESTIONS ALREADY ASKED IN THIS INTERVIEW (never repeat or rephrase these):\n{asked_block}\n\n"
        f"OPENING QUESTION JUST ASKED:\n{opening_question}\n\n"
        f"CANDIDATE'S ANSWER (verbatim):\n{candidate_answer}\n\n"
        "Analyse the answer and write the follow-up now, as JSON."
    )
    raw = _messages_create(FOLLOWUP_SYSTEM_PROMPT, user_content, max_tokens=500, timeout=25)
    return _extract_json(raw)


# ---------------------------------------------------------------------------
# Interview report generation (Module A and Module B)
# ---------------------------------------------------------------------------

REPORT_SYSTEM_PROMPT = """You are an expert technical interviewer writing a structured post-interview \
evaluation report, in the style of a professional ATS interview report. You are given the full \
interview transcript (AI or human interviewer + candidate), the resume, and the job description.

Score honestly based only on what the candidate actually said — do not be generous. Vague, filler, \
or off-topic answers should score low. Ground every judgement in the transcript.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:
{
  "overall_score": 3.5,
  "verdict": "Good",
  "recommendation": "Selected",
  "key_strengths": ["<bullet>", "..."],
  "technical_skills": ["<bullet>", "..."],
  "soft_skills": ["<bullet>", "..."],
  "areas_for_improvement": ["<bullet>", "..."],
  "reason_for_selection": "<2-4 sentence overall narrative justifying the recommendation>",
  "qna": [
    {"seq": 1, "topic": "<topic>", "question": "<question asked>", "candidate_answer": "<candidate's answer, verbatim or lightly cleaned>",
     "reference_answer": "<a strong ideal answer for comparison>", "score_pct": 85}
  ]
}

Rules:
- overall_score is 0-5 (one decimal).
- verdict is one of: "Strong", "Good", "Needs Improvement", "Weak".
- recommendation is one of: "Selected", "Rejected", "Hold".
- Include every substantive question/answer pair from the transcript in qna, in order, with score_pct 0-100.
- If the candidate gave a nonsensical, off-topic, or refusal answer, score it low and say so plainly \
in reference_answer's implicit contrast — do not soften it."""


REPORT_PAIRED_SYSTEM_PROMPT = """You are an expert technical interviewer writing a structured \
post-interview evaluation report, in the style of a professional ATS interview report. You are given \
the resume, the job description, and the interview as numbered QUESTION / ANSWER pairs. The answers are \
the candidate's exact words, transcribed verbatim.

Score honestly based only on what the candidate actually said - do not be generous. Vague, filler, or \
off-topic answers should score low. Ground every judgement in the answers.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:
{
  "recommendation": "Selected",
  "key_strengths": ["<bullet>", "..."],
  "technical_skills": ["<bullet>", "..."],
  "soft_skills": ["<bullet>", "..."],
  "areas_for_improvement": ["<bullet>", "..."],
  "reason_for_selection": "<2-4 sentence overall narrative justifying the recommendation>",
  "evaluations": [
    {"index": 1, "topic": "<short topic label>", "reference_answer": "<a strong ideal answer for comparison>", "score_pct": 85}
  ]
}

Rules:
- Exactly one entry in "evaluations" for EVERY numbered pair, using the same index. Do NOT repeat the \
questions or the candidate's answers in your output - they are attached to your scores automatically.
- score_pct is 0-100 and must reflect ONLY the words in that answer. Never credit the candidate for \
something the resume says but the answer did not.
- A refusal or an "I don't know / not aware / no idea" answer scores 0-10. Filler, vague, or off-topic \
answers score low.
- The overall score and the verdict are computed from your per-question scores, so keep those scores \
honest, and make your recommendation agree with them: "Selected" only when the answers were overall \
good, "Rejected" when they were overall weak, otherwise "Hold".
- recommendation is one of: "Selected", "Rejected", "Hold".
- Every point in strengths, improvements and the narrative must be traceable to something in the answers."""

_ALLOWED_RECOMMENDATIONS = {"Selected", "Rejected", "Hold"}


def build_qna_pairs(transcript):
    """Pairs each interviewer question with the candidate's reply, using the
    transcript's own words. This - not the model - is the source of truth for
    what was asked and what was answered, so the report can never drift from
    what the candidate actually said."""
    pairs = []
    pending = None

    def flush():
        nonlocal pending
        if pending and pending["answers"]:
            pairs.append({
                "question": strip_greeting(pending["question"]),
                "topic": pending["topic"],
                "candidate_answer": " ".join(pending["answers"]),
            })
        pending = None

    for turn in transcript:
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        role = turn.get("role")
        if role == "ai":
            if pending and pending["answers"]:
                flush()
            if pending is None:
                pending = {"question": content, "topic": turn.get("topic"), "answers": []}
            else:  # consecutive interviewer lines with no answer between them: one question
                pending["question"] += "\n" + content
                pending["topic"] = turn.get("topic") or pending["topic"]
        elif role == "candidate" and pending is not None:
            pending["answers"].append(content)
    flush()
    return pairs


def _verdict_for(overall_score):
    if overall_score >= 4.0:
        return "Strong"
    if overall_score >= 3.0:
        return "Good"
    if overall_score >= 2.0:
        return "Needs Improvement"
    return "Weak"


def _finalize_report(report_data, pairs):
    """Attaches the model's per-question scores to the verbatim question/answer
    pairs, then derives the headline score and verdict from those scores so the
    top of the report always agrees with the Q&A table underneath it."""
    evals = {}
    for e in report_data.get("evaluations") or []:
        if not isinstance(e, dict):
            continue
        try:
            evals[int(e.get("index"))] = e
        except (TypeError, ValueError):
            continue

    missing = [i for i in range(1, len(pairs) + 1) if i not in evals]
    if missing:
        raise ValueError(f"Report is missing evaluations for question(s) {missing}")

    qna = []
    for i, pair in enumerate(pairs, start=1):
        ev = evals[i]
        try:
            score = int(round(float(ev.get("score_pct"))))
        except (TypeError, ValueError):
            raise ValueError(f"Report has a non-numeric score for question {i}")
        score = max(0, min(100, score))
        if is_brief_give_up(pair["candidate_answer"]):
            score = min(score, 10)
        qna.append({
            "seq": i,
            "topic": pair.get("topic") or ev.get("topic") or "General",
            "question": pair["question"],
            "candidate_answer": pair["candidate_answer"],
            "reference_answer": ev.get("reference_answer") or "",
            "score_pct": score,
        })

    overall = round(sum(q["score_pct"] for q in qna) / len(qna) / 20, 1)
    verdict = _verdict_for(overall)

    recommendation = report_data.get("recommendation")
    if recommendation not in _ALLOWED_RECOMMENDATIONS:
        recommendation = "Hold"
    # Never let the headline recommendation contradict the score the Q&A table produces.
    if recommendation == "Selected" and verdict not in ("Strong", "Good"):
        recommendation = "Hold"
    if recommendation == "Rejected" and verdict in ("Strong", "Good"):
        recommendation = "Hold"

    final = {k: v for k, v in report_data.items() if k != "evaluations"}
    final.update(overall_score=overall, verdict=verdict, recommendation=recommendation, qna=qna)
    return final


def generate_interview_report(transcript, resume_text: str, jd_content: str, candidate_name: str, interview_note=None):
    pairs = build_qna_pairs(transcript)
    note_block = f"INTERVIEW NOTE: {interview_note}\n\n" if interview_note else ""

    if pairs:
        pairs_block = "\n\n".join(
            f"[{i}] QUESTION: {p['question']}\n    ANSWER: {p['candidate_answer']}"
            for i, p in enumerate(pairs, start=1)
        )
        system = REPORT_PAIRED_SYSTEM_PROMPT
        user_content = (
            f"CANDIDATE: {candidate_name}\n\nJOB DESCRIPTION:\n{jd_content}\n\nRESUME:\n{resume_text}\n\n"
            f"{note_block}"
            f"INTERVIEW - {len(pairs)} QUESTION/ANSWER PAIRS (answers are verbatim, in order):\n{pairs_block}\n\n"
            "Generate the evaluation report JSON now."
        )
    else:
        # No question/answer structure could be recovered from the transcript (e.g. an
        # unlabelled pasted call transcript) - fall back to the model-built Q&A.
        transcript_block = "\n".join(f"{t['role'].upper()}: {t['content']}" for t in transcript)
        system = REPORT_SYSTEM_PROMPT
        user_content = (
            f"CANDIDATE: {candidate_name}\n\nJOB DESCRIPTION:\n{jd_content}\n\nRESUME:\n{resume_text}\n\n"
            f"{note_block}FULL TRANSCRIPT:\n{transcript_block}\n\nGenerate the evaluation report JSON now."
        )

    last_err = None
    for attempt in range(2):
        raw = _messages_create(system, user_content, max_tokens=8000)
        try:
            data = _extract_json(raw)
            return _finalize_report(data, pairs) if pairs else data
        except ValueError as e:
            last_err = e
    raise ValueError(
        "The AI model did not return a valid report after two attempts. Please try generating the report again."
    ) from last_err
