-- =============================================================================
-- Migration 010: mandatory review gate
-- =============================================================================
-- Adds
--   * interview_reviews          - the verdict an admin must record on a completed
--                                  interview before its report can be shared or another
--                                  attempt granted (proceed / hold / reject / re_interview)
--   * interview_drafts.approved_by - which admin approved the interview questions
--   * users.track                - 'practice' | 'interview' (what the candidate is here for)
--
-- Safe on an existing database: creates a new table and adds two columns (one nullable,
-- one with a default). No existing data is removed or overwritten. Existing completed interviews simply
-- show as "Awaiting review" until an admin records a verdict.
--
-- Usage (MySQL 8 / MariaDB 10.3+):
--   mysql -u <user> -p < 010_review_gate.sql
-- (edit the database name below if yours is different)
-- =============================================================================

USE acknowledgermate;

CREATE TABLE IF NOT EXISTS interview_reviews (
  id           INT NOT NULL AUTO_INCREMENT,
  session_id   INT NOT NULL,
  verdict      VARCHAR(20) NOT NULL COMMENT 'proceed | hold | reject | re_interview',
  note         TEXT NULL,
  reviewer_id  INT NULL,
  reviewed_at  DATETIME NULL,
  reopened     TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interview_reviews_session (session_id),
  CONSTRAINT fk_interview_reviews_session FOREIGN KEY (session_id) REFERENCES interview_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_interview_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE interview_drafts
  ADD COLUMN IF NOT EXISTS approved_by INT NULL;

-- users.track: what the candidate is here for ("practice" or "interview"). active_stage stays the
-- live access switch. Existing candidates are classified from what they already did: anyone
-- currently set to the interview stage, or who has ever started an interview, is "interview";
-- everyone else is "practice". Re-classify any candidate from the candidate page afterwards.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS track VARCHAR(12) NOT NULL DEFAULT 'practice';

UPDATE users u
   SET u.track = 'interview'
 WHERE u.role = 'candidate'
   AND u.track = 'practice'
   AND (u.active_stage = 'interview'
        OR EXISTS (SELECT 1 FROM interview_sessions s WHERE s.user_id = u.id));

-- Done. Verify with: DESCRIBE interview_reviews;
