-- =============================================================================
-- Migration: prep-flow staging support
-- =============================================================================
-- Adds what's needed for stage-by-stage prep-flow generation (background
-- thread + live polling, one topic persisted at a time) on top of an
-- EXISTING acknowledgermate database.
--
-- Safe to run more than once: every statement checks whether the column /
-- table already exists first, so nothing is dropped and no existing rows
-- in users, job_descriptions, feedback, settings, login_sessions, or
-- prep_flows are touched or deleted.
--
-- Requires MySQL 8.0.29+ (for the IF NOT EXISTS column syntax). If you're
-- on an older MySQL/MariaDB version, run each ALTER without "IF NOT
-- EXISTS" and ignore a "Duplicate column name" error if already applied.
--
-- Usage:
--   mysql -u <user> -p acknowledgermate < 002_prep_flow_staging.sql
-- =============================================================================

USE acknowledgermate;

ALTER TABLE prep_flows
  ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'in_progress'
    COMMENT 'in_progress | complete | complete_with_errors | failed';

ALTER TABLE prep_flows
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL;

ALTER TABLE prep_flows
  ADD COLUMN IF NOT EXISTS total_topics INT NOT NULL DEFAULT 0
    COMMENT 'Expected topic count, for progress display';

ALTER TABLE prep_flows
  ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS prep_flow_stages (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  prep_flow_id  INT NOT NULL,
  stage_type    VARCHAR(20) NOT NULL COMMENT 'topic | project | tips',
  seq           INT NOT NULL DEFAULT 0,
  payload       JSON NOT NULL,
  created_at    DATETIME NULL,
  CONSTRAINT fk_prep_flow_stages_prep_flow
    FOREIGN KEY (prep_flow_id) REFERENCES prep_flows(id)
    ON DELETE CASCADE,
  INDEX idx_prep_flow_stages_prep_flow_id (prep_flow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Done. Verify with: DESCRIBE prep_flows; DESCRIBE prep_flow_stages;
