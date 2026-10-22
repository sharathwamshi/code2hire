-- =============================================================================
-- Migration: interview attempt cap (attempts_allowed)
-- =============================================================================
-- Adds a single column to `interview_configs` so a candidate can be limited to a
-- fixed number of completed "ai" interview attempts (default: 1), with an admin
-- action ("Reopen interview") incrementing it by one to grant another attempt.
-- Without this, nothing stopped a candidate from starting a brand new interview
-- session immediately after completing one, with no limit.
--
-- Safe on an existing database: only adds a column with a default of 1, so every
-- existing candidate is treated as allowed exactly one attempt (the intended
-- default), and no existing data is changed or removed.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 009_interview_attempts_allowed.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE interview_configs
  ADD COLUMN IF NOT EXISTS attempts_allowed INT NOT NULL DEFAULT 1
    COMMENT 'Number of completed AI-interview attempts this candidate may have; admin increments via Reopen interview';

-- Done. Verify with: DESCRIBE interview_configs;
