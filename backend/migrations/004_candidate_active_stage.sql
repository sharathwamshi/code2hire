-- =============================================================================
-- Migration: candidate active_stage (Prepare-only vs Interview-only access)
-- =============================================================================
-- Adds a single column to `users` so an admin can restrict each candidate to
-- seeing ONLY the Prepare tab or ONLY the Interview tab — never both.
--
-- Safe on an existing database: only adds a column with a default value.
-- Existing candidates default to 'prepare'.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 004_candidate_active_stage.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_stage VARCHAR(10) NOT NULL DEFAULT 'prepare'
    COMMENT 'prepare | interview — which single view the candidate currently sees';

-- Done. Verify with: DESCRIBE users;
