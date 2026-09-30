"""Small text heuristics shared by the interview routes and report generation.

Keeping them in one place means the interview flow (skip the follow-up when a
candidate says they don't know) and the report (score such an answer low) can
never disagree about what counts as a "give-up" answer.
"""
import re

_GIVE_UP_PATTERNS = [
    re.compile(r"\bi\s*(?:do\s*not|don'?t)\s*know\b", re.I),
    re.compile(r"\bno\s*idea\b", re.I),
    re.compile(r"\bnot\s*sure\b", re.I),
    re.compile(r"\bnot\s*aware\b", re.I),
    re.compile(r"\bi\s*(?:can'?t|cannot)\s*answer\s*(?:that|this)?\b", re.I),
    re.compile(r"\bskip\s*(?:this|it|that)?\b", re.I),
    re.compile(r"\bi'?ll\s*pass\b", re.I),
]

_GREETING_RE = re.compile(r"^Hello\b.*?Let's begin\.\s*", re.S)


def is_give_up_answer(text):
    return any(p.search(text or "") for p in _GIVE_UP_PATTERNS)


def is_brief_give_up(text, max_words=15):
    """A give-up phrase on its own (e.g. "I don't know"), as opposed to a long
    answer that merely contains "not sure" somewhere in the middle."""
    return is_give_up_answer(text) and len((text or "").split()) <= max_words


def strip_greeting(content):
    """The very first interviewer turn is "<greeting> Let's begin.\\n\\n<question>".
    Return just the question part so it isn't mistaken for the question text."""
    content = content or ""
    m = _GREETING_RE.match(content)
    if m and content[m.end():].strip():
        return content[m.end():].strip()
    return content
