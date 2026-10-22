-- =============================================================================
-- Migration: interview session end reason (candidate exited early)
-- =============================================================================
-- Adds a single column to `interview_sessions` so an interview that the
-- candidate chose to end early can be told apart from one that ran to its
-- natural end. The report and the admin/candidate history screens use it to
-- label the interview as incomplete.
--
-- Safe on an existing database: only adds a nullable column. Existing rows
-- stay NULL (= ran to the end / not applicable).
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 007_session_end_reason.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS end_reason VARCHAR(20) NULL
    COMMENT 'candidate_exit | NULL — set when the candidate ended the interview early';

-- Done. Verify with: DESCRIBE interview_sessions;
