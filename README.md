# AcknowledgerMate

An AI-native interview preparation AND live-interviewing platform.

- Admins create job descriptions, add candidates, tailor resumes with Anthropic,
  and configure/run live interviews.
- Candidates prepare using a resume-vs-JD interview simulation (**Prepare**),
  then sit an actual monitored interview — either **AI-conducted** (voice+text)
  or a **live video call** with a human interviewer — complete with an
  auto-generated evaluation report and an admin-only integrity lock.

- **Backend:** Flask + MySQL + Flask-SocketIO, runs on port **5050**
- **Frontend:** React (Vite), runs on port **5174**
- **AI:** Anthropic API — JD parsing, prep generation, resume tailoring,
  live interview question generation, and post-interview report generation

---

## 1. Prerequisites

- Python 3.10+
- Node.js 18+
- A running MySQL server (8.x recommended)
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A modern browser with camera/mic permissions for Module B (live interviews)

---

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create the database:

```sql
CREATE DATABASE acknowledgermate CHARACTER SET utf8mb4;
```

```bash
cp .env.example .env
# edit .env: MySQL creds, ANTHROPIC_API_KEY, etc.
python seed.py     # creates tables + default admin (admin / Admin@12345)
python app.py      # runs Flask + Socket.IO on port 5050
```

> If you're upgrading an existing database rather than starting fresh, run the
> migrations in `backend/migrations/` in order instead of `seed.py`'s
> `db.create_all()` — see section 6 below.

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Live at `http://localhost:5174`. Vite proxies `/api/*` and `/socket.io/*` to
Flask on port 5050.

---

## 4. First run walkthrough

1. Sign in as admin (`admin` / `Admin@12345` by default).
2. **Settings**: confirm your Anthropic key.
3. **Job descriptions**: add a JD — auto-extracted into key requirement points.
4. **Candidates**: add a candidate, assign the JD, upload/paste their resume.
5. Open that candidate's detail page → **Interview configuration**:
   - Choose **AI-conducted** (voice+text) or **Live video call**.
   - Set difficulty, max questions (AI mode), voice on/off, integrity policy
     (violation threshold, require fullscreen).
   - For live mode, set an interviewer name and **generate a join link**.
6. As the candidate: use **Prepare** to study, then open **Interview**
   (AI mode) or the shared link (live mode) to take the actual interview.
7. Both modes show a **big blocking disclaimer** before starting — if the
   candidate switches tabs, loses focus, exits fullscreen, opens dev tools, or
   pastes into an answer, the interview **pauses immediately**. Only an admin
   can resume it (from exactly where it paused) or restart it from scratch,
   from **Admin → Interviews**.
8. Once complete, an AI-generated evaluation report appears on the session's
   detail page — overall score, strengths/weaknesses, full Q&A with reference
   answers, and the full integrity/action-log audit trail.

---

## 5. Project structure

```
backend/
  app.py                     Flask + Socket.IO app factory (port 5050)
  sockets.py                 WebRTC signaling relay for live interviews (Module B)
  config.py / extensions.py  Config and shared singletons (db, jwt, bcrypt, socketio)
  models.py                  All models — platform + interview module
  seed.py                    Creates tables + default admin
  migrations/                Idempotent SQL migrations (see below)
  routes/
    auth.py                  Login, change password, heartbeat
    admin.py                 JD/candidate CRUD, settings, interview config,
                              sessions dashboard, resume/restart/pause, notifications
    candidate.py             Dashboard, resume, staged Prepare-flow generation
    interview.py             Module A (AI interview) + Module B (live join/recording)
                              + shared integrity-violation reporting
  services/
    anthropic_service.py     All Anthropic prompts: JD parsing, prep stages,
                              resume tailoring, live interview Q&A, report generation
    resume_parser.py         PDF / DOCX / TXT resume text extraction

frontend/
  src/
    api/client.js             Axios + JWT
    api/socket.js              Socket.IO client (WebRTC signaling)
    context/AuthContext.jsx
    components/
      ProtectedRoute.jsx
      NodeGraphBackdrop.jsx     Three.js ambient visual
      useIntegrityMonitor.js    Tab/blur/fullscreen/devtools/paste detection hook
      InterviewDisclaimer.jsx  Blocking pre-interview disclaimer
      PausedOverlay.jsx         Post-violation "waiting for admin" screen
      NotificationBell.jsx      Admin violation/completion notifications
    pages/
      LoginPage.jsx
      admin/                    Layout, Overview, JDs, Users, UserDetail (+ interview
                                config), InterviewSessions (dashboard),
                                InterviewSessionDetail (transcript/report), Settings
      candidate/                Layout, Dashboard, Prepare, Feedback, ChangePassword,
                                InterviewRoom (Module A), LiveInterview (Module B)
```

---

## 6. Database migrations

Migrations in `backend/migrations/` are numbered and idempotent — safe to run
more than once, and safe on an existing database (they only add, never drop).

| File | Adds |
|---|---|
| `002_prep_flow_staging.sql` | Stage-by-stage prep-flow generation support |
| `003_interview_module.sql`  | Interview module: configs, sessions, turns, integrity events, action logs, reports, notifications |

```bash
mysql -u <user> -p acknowledgermate < backend/migrations/002_prep_flow_staging.sql
mysql -u <user> -p acknowledgermate < backend/migrations/003_interview_module.sql
```

For a brand-new database, just run `python seed.py` instead — it creates
every table (including these) directly from `models.py`.

---

## 7. The Interview module in detail

### Module A — AI-conducted interview
- Turn-by-turn: the AI asks one question at a time, reacting to the candidate's
  actual answer (deeper follow-up on strong answers, clarifying on vague ones,
  more fundamental questions on "no experience").
- Voice via the browser's built-in Web Speech API: `speechSynthesis` reads
  each AI message aloud (togglable), `SpeechRecognition` transcribes spoken
  answers into the input box. No third-party STT/TTS service required, but
  quality/accuracy is what the browser provides — for production-grade voice,
  swap in a dedicated provider (e.g. a cloud STT/TTS API) behind the same
  `voice_enabled`/`voice_id` config fields.
- On completion, a report is generated automatically in the background.

### Module B — Live human interview
- Admin generates a join link (`InterviewConfig.link_token`) tied to one
  candidate; the candidate opens it, passes the same disclaimer, then a
  peer-to-peer WebRTC video call connects candidate and interviewer (whoever
  opens the admin's session view for that session ID joins the same room).
- Signaling is a minimal Socket.IO relay (`backend/sockets.py`) — it only
  relays offer/answer/ICE messages; media flows directly between browsers.
  For production use across NATs/firewalls, add a TURN server to the ICE
  servers list in `LiveInterview.jsx`.
- The candidate's browser records the call via `MediaRecorder` and uploads
  the file on hang-up; admins can download it from the session detail page.
- **No built-in speech-to-text pipeline is wired up for live calls** — real
  transcription requires an external ASR provider (e.g. a cloud speech API).
  Until one is integrated, the admin can paste a transcript (or dictate one
  while reviewing the recording) into the session detail page's "Generate
  report" box, and the same Anthropic report-generation prompt runs on it.

### Integrity lock (both modules)
- A full-screen, checkbox-gated disclaimer is shown before the interview can
  start, and again (shorter) after any admin-resume.
- Detected violations: tab switch, window blur, fullscreen exit, a devtools
  heuristic (window size gap), and paste-into-answer.
- **Any violation pauses the interview immediately — no auto-resume, ever.**
  Only `POST /admin/interview-sessions/<id>/resume` (admin-only, JWT-checked)
  can continue it, from exactly the turn it stopped at. Admins can also
  `restart` (discards the transcript, generates fresh questions) or
  `manual-pause` a session themselves.
- Every violation and every admin action is logged (`integrity_events`,
  `session_action_logs`) and shown in full on the session detail page and
  baked into the final report's context.
- Admins get an in-app notification (bell icon, polled every 15s) the moment
  a violation occurs or a report is ready.

---

## 8. Resume uploads

Both the candidate's own upload and the admin's upload-for-candidate accept
**PDF**, **Word (.docx)**, and plain **.txt/.md** files (`services/resume_parser.py`).
Legacy `.doc` and scanned/image-only PDFs aren't supported — a clear error
asks for a re-save or manual paste instead.

---

## 9. Production checklist

- Replace `SECRET_KEY` / `JWT_SECRET_KEY` with strong random values.
- Run behind gunicorn with an eventlet/gevent worker (required for
  Flask-SocketIO in production) + a reverse proxy — `socketio.run()` in
  `app.py` is dev-only.
- Add a TURN server to `LiveInterview.jsx`'s `ICE_SERVERS` for reliable
  video calls across restrictive networks.
- Wire a real ASR/TTS provider in place of the browser Web Speech API and the
  manual-transcript-paste flow, if production-grade accuracy is needed.
- Set `FRONTEND_ORIGIN` to your real deployed frontend URL.
- Store the MySQL password and Anthropic key as secrets, not in a committed `.env`.
- Move resume/recording file storage to object storage (S3, etc.) at scale.
