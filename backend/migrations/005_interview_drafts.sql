-- =============================================================================
-- Migration: Pre-generated & admin-approved interview question drafts
-- =============================================================================
-- NOTE: if you're setting up a database FROM SCRATCH by running migrations
-- 002-005 in order, the interview_drafts table and the draft_id/draft_step
-- columns on interview_sessions are ALREADY created by 003 above (which
-- includes them directly). This file is a no-op in that case — it exists
-- only for databases that had 003 applied BEFORE draft support was added
-- to it, so re-running it is always safe either way.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 005_interview_drafts.sql
-- =============================================================================

USE acknowledgermate;

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

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS draft_id INT NULL
    COMMENT 'FK to interview_drafts.id — set if this session is using a pre-approved question script';

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS draft_step INT NOT NULL DEFAULT 0
    COMMENT 'Index into the approved draft''s flattened turn list';

-- NOTE: unlike columns, MySQL has no clean "IF NOT EXISTS" for constraints.
-- If you run this a second time, this next statement may fail with
-- "Duplicate key name" or "already exists" — that's expected and safe to
-- ignore; it just means it was already applied.
ALTER TABLE interview_sessions
  ADD CONSTRAINT fk_interview_sessions_draft
    FOREIGN KEY (draft_id) REFERENCES interview_drafts(id) ON DELETE SET NULL;

-- Done. Verify with: SHOW TABLES LIKE 'interview_drafts'; DESCRIBE interview_sessions;
