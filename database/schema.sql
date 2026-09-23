-- Baseline MySQL 8 schema for status.dunamismax. Safe to reapply: it creates
-- missing tables and never alters or deletes existing ones. All times are UTC.
-- Row ids match the PostgreSQL history they were migrated from.

CREATE TABLE IF NOT EXISTS targets (
    id VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    target_kind VARCHAR(32) NOT NULL,
    group_name VARCHAR(128) NULL,
    public_url VARCHAR(512) NULL,
    probe_url VARCHAR(512) NULL,
    repo_name VARCHAR(255) NULL,
    first_seen_at DATETIME(6) NOT NULL,
    last_seen_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS check_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    target_id VARCHAR(128) NOT NULL,
    check_kind VARCHAR(32) NOT NULL,
    state VARCHAR(16) NOT NULL,
    checked_at DATETIME(6) NOT NULL,
    latency_ms BIGINT UNSIGNED NULL,
    reason TEXT NOT NULL,
    probe_version VARCHAR(64) NOT NULL,
    public_payload JSON NOT NULL,
    inserted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY check_runs_target_checked_at_idx (target_id, checked_at),
    KEY check_runs_retention_idx (checked_at),
    CONSTRAINT check_runs_target_fk FOREIGN KEY (target_id) REFERENCES targets (id) ON DELETE CASCADE,
    CONSTRAINT check_runs_state_check CHECK (state IN ('operational', 'degraded', 'down', 'maintenance', 'unknown'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rollups (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    overall_state VARCHAR(16) NOT NULL,
    checked_at DATETIME(6) NOT NULL,
    operational_count INT UNSIGNED NOT NULL,
    degraded_count INT UNSIGNED NOT NULL,
    down_count INT UNSIGNED NOT NULL,
    maintenance_count INT UNSIGNED NOT NULL,
    unknown_count INT UNSIGNED NOT NULL,
    snapshot JSON NOT NULL,
    inserted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY rollups_checked_at_idx (checked_at),
    CONSTRAINT rollups_state_check CHECK (overall_state IN ('operational', 'degraded', 'down', 'maintenance', 'unknown'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    affected_targets JSON NOT NULL DEFAULT (JSON_ARRAY()),
    state VARCHAR(16) NOT NULL,
    started_at DATETIME(6) NOT NULL,
    resolved_at DATETIME(6) NULL,
    public_notes TEXT NOT NULL DEFAULT (''),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY incidents_started_at_idx (started_at),
    CONSTRAINT incidents_state_check CHECK (state IN ('investigating', 'identified', 'monitoring', 'resolved')),
    CONSTRAINT incidents_resolved_check CHECK (resolved_at IS NULL OR resolved_at >= started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS maintenance_windows (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    affected_targets JSON NOT NULL DEFAULT (JSON_ARRAY()),
    state VARCHAR(16) NOT NULL,
    starts_at DATETIME(6) NOT NULL,
    ends_at DATETIME(6) NOT NULL,
    public_notes TEXT NOT NULL DEFAULT (''),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY maintenance_windows_starts_at_idx (starts_at),
    CONSTRAINT maintenance_windows_state_check CHECK (state IN ('scheduled', 'in_progress', 'complete', 'canceled')),
    CONSTRAINT maintenance_windows_range_check CHECK (ends_at >= starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS deployment_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    service_id VARCHAR(128) NULL,
    repo_name VARCHAR(255) NULL,
    commit_sha VARCHAR(64) NULL,
    environment VARCHAR(64) NOT NULL DEFAULT 'production',
    deployed_at DATETIME(6) NOT NULL,
    public_summary TEXT NOT NULL DEFAULT (''),
    metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
    inserted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY deployment_events_deployed_at_idx (deployed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS alert_notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dedup_key VARCHAR(255) NOT NULL,
    target_id VARCHAR(128) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    observed_state VARCHAR(16) NOT NULL,
    title VARCHAR(512) NOT NULL,
    public_summary TEXT NOT NULL,
    observed_at DATETIME(6) NOT NULL,
    notification_target VARCHAR(64) NOT NULL,
    public_payload JSON NOT NULL,
    sent_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY alert_notifications_dedup_sent_at_idx (dedup_key, sent_at),
    KEY alert_notifications_sent_at_idx (sent_at),
    CONSTRAINT alert_notifications_severity_check CHECK (severity IN ('warning', 'critical')),
    CONSTRAINT alert_notifications_state_check CHECK (observed_state IN ('degraded', 'down', 'unknown'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
