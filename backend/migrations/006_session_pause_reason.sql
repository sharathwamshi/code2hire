-- =============================================================================
-- Migration: interview session pause reason (violation vs candidate-requested)
-- =============================================================================
-- Adds a single column to `interview_sessions` so a paused interview can be
-- told apart by WHY it paused — an integrity violation, or the candidate
-- asking to stop — instead of every pause showing the candidate the same
-- "unusual activity was detected" message.
--
-- Safe on an existing database: only adds a nullable column. Existing rows
-- are left as NULL (treated as a violation-pause, the prior behavior).
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 006_session_pause_reason.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS pause_reason VARCHAR(20) NULL
    COMMENT 'violation | candidate_stop — why the session is currently paused';

-- Done. Verify with: DESCRIBE interview_sessions;
