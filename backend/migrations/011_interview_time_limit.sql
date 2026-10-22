-- =============================================================================
-- Migration: interview time limit
-- =============================================================================
-- interview_configs.time_limit_minutes  - overall time allowed for the AI interview (NULL = no limit)
-- interview_sessions.paused_seconds     - time spent paused, which the clock does not count
--
-- Safe on an existing database: two additive columns. Every existing config keeps
-- NULL (no limit) and every existing session starts at 0 paused seconds, so
-- nothing changes for interviews already set up.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 011_interview_time_limit.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE interview_configs
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT NULL DEFAULT NULL
    COMMENT 'Overall AI-interview time limit in minutes; NULL means no limit';

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS paused_seconds INT NOT NULL DEFAULT 0
    COMMENT 'Seconds the session spent paused; excluded from the time limit';

-- Verify with: DESCRIBE interview_configs; DESCRIBE interview_sessions;
