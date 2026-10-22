-- =============================================================================
-- Migration: Interview module (AI-conducted + Live) and Integrity Lock
-- =============================================================================
-- Adds Module A (AI interview), Module B (live video call), and the
-- integrity lock: configs, sessions, turns, integrity events, action logs,
-- reports, notifications.
--
-- Safe on an existing database: only CREATES new tables. Nothing here
-- drops or alters users, job_descriptions, login_sessions, prep_flows,
-- prep_flow_stages, feedback, or settings.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 003_interview_module.sql
-- =============================================================================

USE acknowledgermate;

CREATE TABLE IF NOT EXISTS interview_configs (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  mode                  VARCHAR(10) NOT NULL DEFAULT 'ai' COMMENT 'ai | live',
  difficulty            VARCHAR(10) NOT NULL DEFAULT 'medium',
  voice_enabled         TINYINT(1) NOT NULL DEFAULT 1,
  voice_id              VARCHAR(100) NULL,
  max_questions         INT NOT NULL DEFAULT 12,
  skill_tags            JSON NULL,
  violation_threshold   INT NOT NULL DEFAULT 1,
  require_fullscreen    TINYINT(1) NOT NULL DEFAULT 1,
  interviewer_name      VARCHAR(150) NULL,
  link_token            VARCHAR(64) NULL,
  link_expires_at       DATETIME NULL,
  created_at            DATETIME NULL,
  updated_at            DATETIME NULL,
  UNIQUE KEY uq_interview_configs_user (user_id),
  UNIQUE KEY uq_interview_configs_link_token (link_token),
  CONSTRAINT fk_interview_configs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interview_drafts (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  jd_id             INT NOT NULL,
  difficulty        VARCHAR(10) NOT NULL DEFAULT 'medium',
  status            VARCHAR(20) NOT NULL DEFAULT 'generating' COMMENT 'generating | ready | approved | failed',
  error_message     TEXT NULL,
  total_topics      INT NOT NULL DEFAULT 0,
  questions_json    JSON NULL,
  created_at        DATETIME NULL,
  approved_at       DATETIME NULL,
  INDEX idx_interview_drafts_user (user_id),
  INDEX idx_interview_drafts_status (status),
  CONSTRAINT fk_interview_drafts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_drafts_jd
    FOREIGN KEY (jd_id) REFERENCES job_descriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interview_sessions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  jd_id             INT NOT NULL,
  config_id         INT NULL,
  mode              VARCHAR(10) NOT NULL DEFAULT 'ai',
  difficulty        VARCHAR(10) NOT NULL DEFAULT 'medium',
  status            VARCHAR(20) NOT NULL DEFAULT 'not_started',
  current_seq       INT NOT NULL DEFAULT 0,
  question_count    INT NOT NULL DEFAULT 0,
  draft_id          INT NULL,
  draft_step        INT NOT NULL DEFAULT 0,
  started_at        DATETIME NULL,
  paused_at         DATETIME NULL,
  completed_at      DATETIME NULL,
  created_at        DATETIME NULL,
  recording_path    VARCHAR(500) NULL,
  INDEX idx_interview_sessions_user (user_id),
  INDEX idx_interview_sessions_status (status),
  CONSTRAINT fk_interview_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_sessions_jd
    FOREIGN KEY (jd_id) REFERENCES job_descriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_sessions_config
    FOREIGN KEY (config_id) REFERENCES interview_configs(id) ON DELETE SET NULL,
  CONSTRAINT fk_interview_sessions_draft
    FOREIGN KEY (draft_id) REFERENCES interview_drafts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interview_turns (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  session_id    INT NOT NULL,
  seq           INT NOT NULL,
  role          VARCHAR(12) NOT NULL COMMENT 'ai | candidate | system',
  content       TEXT NOT NULL,
  topic         VARCHAR(255) NULL,
  created_at    DATETIME NULL,
  INDEX idx_interview_turns_session (session_id),
  CONSTRAINT fk_interview_turns_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS integrity_events (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  session_id            INT NOT NULL,
  event_type            VARCHAR(30) NOT NULL,
  severity              VARCHAR(10) NOT NULL DEFAULT 'medium',
  active_question_seq   INT NULL,
  occurred_at           DATETIME NULL,
  resolved              TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_integrity_events_session (session_id),
  CONSTRAINT fk_integrity_events_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS session_action_logs (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  session_id        INT NOT NULL,
  action            VARCHAR(20) NOT NULL COMMENT 'pause | resume | restart | manual_pause',
  actor_admin_id    INT NULL,
  note              TEXT NULL,
  created_at        DATETIME NULL,
  INDEX idx_session_action_logs_session (session_id),
  CONSTRAINT fk_session_action_logs_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_action_logs_actor
    FOREIGN KEY (actor_admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interview_reports (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  session_id        INT NOT NULL,
  overall_score     FLOAT NULL,
  verdict           VARCHAR(30) NULL,
  recommendation    VARCHAR(20) NULL,
  summary_json      JSON NULL,
  qna_json          JSON NULL,
  generated_at      DATETIME NULL,
  UNIQUE KEY uq_interview_reports_session (session_id),
  CONSTRAINT fk_interview_reports_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  type          VARCHAR(30) NOT NULL COMMENT 'violation | interview_completed | interview_paused',
  message       VARCHAR(500) NOT NULL,
  session_id    INT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NULL,
  INDEX idx_notifications_is_read (is_read),
  CONSTRAINT fk_notifications_session
    FOREIGN KEY (session_id) REFERENCES interview_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Done. Verify with: SHOW TABLES LIKE 'interview_%'; SHOW TABLES LIKE 'notifications';
