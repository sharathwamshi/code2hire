"""
Azure Speech Services integration for the Interview module's voice features
(TTS for AI questions, STT for candidate voice answers).

Security note: the browser-side Speech SDK needs a short-lived AUTHORIZATION
TOKEN, not the raw subscription key. This module exchanges the key for a
10-minute token server-side, so the actual Azure key never reaches the
candidate's browser. The frontend calls GET /api/candidate/interview/speech-token
to get {token, region, voice}, and passes that straight into the Azure
Speech SDK (SpeechConfig.fromAuthorizationToken).
"""
import requests

from flask import current_app
from models import Setting

# A practical, curated list of Azure neural voices offered in the admin UI.
# (The full Azure catalog has 400+ voices — this list covers common choices.)
AVAILABLE_VOICES = [
    {"id": "en-US-AvaMultilingualNeural", "label": "Ava (US, multilingual, warm)"},
    {"id": "en-US-JennyNeural", "label": "Jenny (US, friendly)"},
    {"id": "en-US-GuyNeural", "label": "Guy (US, confident)"},
    {"id": "en-US-AriaNeural", "label": "Aria (US, professional)"},
    {"id": "en-GB-SoniaNeural", "label": "Sonia (UK)"},
    {"id": "en-GB-RyanNeural", "label": "Ryan (UK)"},
    {"id": "en-IN-NeerjaNeural", "label": "Neerja (India)"},
    {"id": "en-IN-PrabhatNeural", "label": "Prabhat (India)"},
    {"id": "en-AU-NatashaNeural", "label": "Natasha (Australia)"},
]
DEFAULT_VOICE = "en-US-AvaMultilingualNeural"


def get_active_credentials():
    """Resolves the Azure Speech key/region: Admin > Settings takes priority
    over the .env values, same pattern as the Anthropic key."""
    try:
        db_key = Setting.get("azure_speech_key")
        db_region = Setting.get("azure_speech_region")
    except Exception:
        db_key = db_region = None
    key = db_key or current_app.config.get("AZURE_SPEECH_KEY")
    region = db_region or current_app.config.get("AZURE_SPEECH_REGION")
    return key, region


def is_configured():
    key, region = get_active_credentials()
    return bool(key and region)


def issue_token():
    """Exchanges the Azure Speech subscription key for a short-lived
    (10-minute) authorization token the browser can use directly."""
    key, region = get_active_credentials()
    if not key or not region:
        raise RuntimeError(
            "Azure Speech isn't configured yet. Set AZURE_SPEECH_KEY and "
            "AZURE_SPEECH_REGION in the backend .env, or add them from Admin > Settings."
        )

    url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    resp = requests.post(url, headers={"Ocp-Apim-Subscription-Key": key}, timeout=10)
    resp.raise_for_status()
    return resp.text, region
