-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 30, 2026 at 08:51 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `acknowledgermate`
--

-- --------------------------------------------------------

--
-- Table structure for table `feedback`
--

CREATE TABLE `feedback` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `topic` varchar(255) NOT NULL,
  `self_rating` int(11) NOT NULL,
  `comments` text DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `integrity_events`
--

CREATE TABLE `integrity_events` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `event_type` varchar(30) NOT NULL COMMENT 'tab_switch | window_blur | fullscreen_exit | devtools | copy_paste | multi_face | no_face | disconnect',
  `severity` varchar(10) NOT NULL DEFAULT 'medium' COMMENT 'low | medium | high',
  `active_question_seq` int(11) DEFAULT NULL,
  `occurred_at` datetime DEFAULT NULL,
  `resolved` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `interview_configs`
--

CREATE TABLE `interview_configs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `mode` varchar(10) NOT NULL DEFAULT 'ai' COMMENT 'ai | live',
  `difficulty` varchar(10) NOT NULL DEFAULT 'medium' COMMENT 'low | medium | high',
  `voice_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `voice_id` varchar(100) DEFAULT NULL,
  `max_questions` int(11) NOT NULL DEFAULT 12,
  `skill_tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`skill_tags`)),
  `violation_threshold` int(11) NOT NULL DEFAULT 1,
  `require_fullscreen` tinyint(1) NOT NULL DEFAULT 1,
  `interviewer_name` varchar(150) DEFAULT NULL,
  `link_token` varchar(64) DEFAULT NULL,
  `link_expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `attempts_allowed` int(11) NOT NULL DEFAULT 1 COMMENT 'Number of completed AI-interview attempts this candidate may have; admin increments via Reopen interview'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `interview_drafts`
--

CREATE TABLE `interview_drafts` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `jd_id` int(11) NOT NULL,
  `difficulty` varchar(10) NOT NULL DEFAULT 'medium',
  `status` varchar(20) NOT NULL DEFAULT 'generating' COMMENT 'generating | ready | approved | failed',
  `error_message` text DEFAULT NULL,
  `total_topics` int(11) NOT NULL DEFAULT 0,
  `questions_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of {seq, jd_point, found_in_resume, evidence_from_resume, opening_question, follow_up_question, edited}' CHECK (json_valid(`questions_json`)),
  `created_at` datetime DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `interview_reports`
--

CREATE TABLE `interview_reports` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `overall_score` float DEFAULT NULL,
  `verdict` varchar(30) DEFAULT NULL COMMENT 'Strong | Good | Needs Improvement | Weak',
  `recommendation` varchar(20) DEFAULT NULL COMMENT 'Selected | Rejected | Hold',
  `summary_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`summary_json`)),
  `qna_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`qna_json`)),
  `generated_at` datetime DEFAULT NULL,
  `shared_with_candidate` tinyint(1) NOT NULL DEFAULT 0 COMMENT '0 = admin only (default), 1 = shared with the candidate',
  `shared_at` datetime DEFAULT NULL COMMENT 'when the admin shared the report with the candidate'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `interview_sessions`
--

CREATE TABLE `interview_sessions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `jd_id` int(11) NOT NULL,
  `config_id` int(11) DEFAULT NULL,
  `mode` varchar(10) NOT NULL DEFAULT 'ai' COMMENT 'ai | live',
  `difficulty` varchar(10) NOT NULL DEFAULT 'medium',
  `status` varchar(20) NOT NULL DEFAULT 'not_started' COMMENT 'not_started | in_progress | paused | completed | restarted | abandoned',
  `current_seq` int(11) NOT NULL DEFAULT 0,
  `question_count` int(11) NOT NULL DEFAULT 0,
  `started_at` datetime DEFAULT NULL,
  `paused_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `recording_path` varchar(500) DEFAULT NULL,
  `draft_id` int(11) DEFAULT NULL COMMENT 'FK to interview_drafts.id — set if this session is using a pre-approved question script',
  `draft_step` int(11) NOT NULL DEFAULT 0 COMMENT 'Index into the approved draft''s flattened turn list (2 turns per topic: opening, then follow-up)',
  `pause_reason` varchar(20) DEFAULT NULL COMMENT 'violation | candidate_stop — why the session is currently paused',
  `end_reason` varchar(20) DEFAULT NULL COMMENT 'candidate_exit | NULL — set when the candidate ended the interview early'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `interview_turns`
--

CREATE TABLE `interview_turns` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `seq` int(11) NOT NULL,
  `role` varchar(12) NOT NULL COMMENT 'ai | candidate | system',
  `content` text NOT NULL,
  `topic` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_descriptions`
--

CREATE TABLE `job_descriptions` (
  `id` int(11) NOT NULL,
  `title` varchar(200) NOT NULL,
  `company` varchar(150) DEFAULT NULL,
  `content` text NOT NULL,
  `key_points` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`key_points`)),
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `login_sessions`
--

CREATE TABLE `login_sessions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `login_at` datetime DEFAULT NULL,
  `last_heartbeat_at` datetime DEFAULT NULL,
  `logout_at` datetime DEFAULT NULL,
  `duration_seconds` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `type` varchar(30) NOT NULL COMMENT 'violation | interview_completed | interview_paused',
  `message` varchar(500) NOT NULL,
  `session_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prep_flows`
--

CREATE TABLE `prep_flows` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `jd_id` int(11) NOT NULL,
  `status` varchar(24) NOT NULL,
  `error_message` text DEFAULT NULL,
  `generated_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `total_topics` int(11) NOT NULL DEFAULT 0 COMMENT 'Expected topic count, for progress display'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prep_flow_stages`
--

CREATE TABLE `prep_flow_stages` (
  `id` int(11) NOT NULL,
  `prep_flow_id` int(11) NOT NULL,
  `stage_type` varchar(20) NOT NULL,
  `seq` int(11) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `session_action_logs`
--

CREATE TABLE `session_action_logs` (
  `id` int(11) NOT NULL,
  `session_id` int(11) NOT NULL,
  `action` varchar(20) NOT NULL COMMENT 'pause | resume | restart | manual_pause',
  `actor_admin_id` int(11) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `key` varchar(100) NOT NULL,
  `value` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(80) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `full_name` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `training_level` varchar(10) NOT NULL,
  `jd_id` int(11) DEFAULT NULL,
  `resume_filename` varchar(255) DEFAULT NULL,
  `resume_text` text DEFAULT NULL,
  `resume_updated_text` text DEFAULT NULL,
  `resume_updated_at` datetime DEFAULT NULL,
  `must_change_password` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `login_count` int(11) DEFAULT NULL,
  `total_time_seconds` int(11) DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `active_stage` varchar(10) NOT NULL DEFAULT 'prepare' COMMENT 'prepare | interview — which single view the candidate currently sees'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `feedback`
--
ALTER TABLE `feedback`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `integrity_events`
--
ALTER TABLE `integrity_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_integrity_events_session` (`session_id`);

--
-- Indexes for table `interview_configs`
--
ALTER TABLE `interview_configs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_interview_configs_user` (`user_id`),
  ADD UNIQUE KEY `uq_interview_configs_link_token` (`link_token`);

--
-- Indexes for table `interview_drafts`
--
ALTER TABLE `interview_drafts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_interview_drafts_user` (`user_id`),
  ADD KEY `idx_interview_drafts_status` (`status`),
  ADD KEY `fk_interview_drafts_jd` (`jd_id`);

--
-- Indexes for table `interview_reports`
--
ALTER TABLE `interview_reports`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_interview_reports_session` (`session_id`);

--
-- Indexes for table `interview_sessions`
--
ALTER TABLE `interview_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_interview_sessions_user` (`user_id`),
  ADD KEY `idx_interview_sessions_status` (`status`),
  ADD KEY `fk_interview_sessions_jd` (`jd_id`),
  ADD KEY `fk_interview_sessions_config` (`config_id`),
  ADD KEY `fk_interview_sessions_draft` (`draft_id`);

--
-- Indexes for table `interview_turns`
--
ALTER TABLE `interview_turns`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_interview_turns_session` (`session_id`);

--
-- Indexes for table `job_descriptions`
--
ALTER TABLE `job_descriptions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `login_sessions`
--
ALTER TABLE `login_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_is_read` (`is_read`),
  ADD KEY `fk_notifications_session` (`session_id`);

--
-- Indexes for table `prep_flows`
--
ALTER TABLE `prep_flows`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `jd_id` (`jd_id`);

--
-- Indexes for table `prep_flow_stages`
--
ALTER TABLE `prep_flow_stages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `prep_flow_id` (`prep_flow_id`);

--
-- Indexes for table `session_action_logs`
--
ALTER TABLE `session_action_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_session_action_logs_session` (`session_id`),
  ADD KEY `fk_session_action_logs_actor` (`actor_admin_id`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `key` (`key`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ix_users_username` (`username`),
  ADD KEY `jd_id` (`jd_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `feedback`
--
ALTER TABLE `feedback`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `integrity_events`
--
ALTER TABLE `integrity_events`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `interview_configs`
--
ALTER TABLE `interview_configs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `interview_drafts`
--
ALTER TABLE `interview_drafts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `interview_reports`
--
ALTER TABLE `interview_reports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `interview_sessions`
--
ALTER TABLE `interview_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `interview_turns`
--
ALTER TABLE `interview_turns`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `job_descriptions`
--
ALTER TABLE `job_descriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_sessions`
--
ALTER TABLE `login_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prep_flows`
--
ALTER TABLE `prep_flows`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prep_flow_stages`
--
ALTER TABLE `prep_flow_stages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `session_action_logs`
--
ALTER TABLE `session_action_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `feedback`
--
ALTER TABLE `feedback`
  ADD CONSTRAINT `feedback_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `integrity_events`
--
ALTER TABLE `integrity_events`
  ADD CONSTRAINT `fk_integrity_events_session` FOREIGN KEY (`session_id`) REFERENCES `interview_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview_configs`
--
ALTER TABLE `interview_configs`
  ADD CONSTRAINT `fk_interview_configs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview_drafts`
--
ALTER TABLE `interview_drafts`
  ADD CONSTRAINT `fk_interview_drafts_jd` FOREIGN KEY (`jd_id`) REFERENCES `job_descriptions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_interview_drafts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview_reports`
--
ALTER TABLE `interview_reports`
  ADD CONSTRAINT `fk_interview_reports_session` FOREIGN KEY (`session_id`) REFERENCES `interview_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview_sessions`
--
ALTER TABLE `interview_sessions`
  ADD CONSTRAINT `fk_interview_sessions_config` FOREIGN KEY (`config_id`) REFERENCES `interview_configs` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_interview_sessions_draft` FOREIGN KEY (`draft_id`) REFERENCES `interview_drafts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_interview_sessions_jd` FOREIGN KEY (`jd_id`) REFERENCES `job_descriptions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_interview_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `interview_turns`
--
ALTER TABLE `interview_turns`
  ADD CONSTRAINT `fk_interview_turns_session` FOREIGN KEY (`session_id`) REFERENCES `interview_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `login_sessions`
--
ALTER TABLE `login_sessions`
  ADD CONSTRAINT `login_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_session` FOREIGN KEY (`session_id`) REFERENCES `interview_sessions` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `prep_flows`
--
ALTER TABLE `prep_flows`
  ADD CONSTRAINT `prep_flows_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `prep_flows_ibfk_2` FOREIGN KEY (`jd_id`) REFERENCES `job_descriptions` (`id`);

--
-- Constraints for table `prep_flow_stages`
--
ALTER TABLE `prep_flow_stages`
  ADD CONSTRAINT `prep_flow_stages_ibfk_1` FOREIGN KEY (`prep_flow_id`) REFERENCES `prep_flows` (`id`);

--
-- Constraints for table `session_action_logs`
--
ALTER TABLE `session_action_logs`
  ADD CONSTRAINT `fk_session_action_logs_actor` FOREIGN KEY (`actor_admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_session_action_logs_session` FOREIGN KEY (`session_id`) REFERENCES `interview_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`jd_id`) REFERENCES `job_descriptions` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
