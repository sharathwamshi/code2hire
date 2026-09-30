-- =============================================================================
-- Migration: report sharing (candidates only see a report once it is shared)
-- =============================================================================
-- Adds two columns to `interview_reports`:
--   shared_with_candidate  0 = admin-only (the default), 1 = the candidate can see it
--   shared_at              when the admin shared it
--
-- Every report that already exists is set to 0 (NOT shared). That is deliberate:
-- nothing becomes visible to a candidate until an admin chooses to share it.
--
-- Safe on an existing database: only adds columns; no data is changed or removed.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 008_report_sharing.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS shared_with_candidate TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '0 = admin only (default), 1 = shared with the candidate',
  ADD COLUMN IF NOT EXISTS shared_at DATETIME NULL
    COMMENT 'when the admin shared the report with the candidate';

-- Done. Verify with: DESCRIBE interview_reports;
