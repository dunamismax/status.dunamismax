use std::time::Duration;

use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use thiserror::Error;

use crate::model::{
    DeploymentEvent, IncidentRecord, MaintenanceWindow, ProjectStatus, ServiceStatus,
    StatusSnapshot,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct StatusStore {
    pool: PgPool,
}

impl StatusStore {
    pub async fn connect(database_url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(CONNECT_TIMEOUT)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> Result<(), StoreError> {
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        Ok(())
    }

    pub async fn ready(&self) -> Result<(), StoreError> {
        sqlx::query("select 1").execute(&self.pool).await?;
        Ok(())
    }

    pub async fn record_snapshot(&self, snapshot: &StatusSnapshot) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;

        for service in &snapshot.services {
            upsert_service_target(&mut tx, service).await?;
            insert_service_check(&mut tx, service).await?;
        }

        for project in &snapshot.projects {
            upsert_project_target(&mut tx, project).await?;
            insert_project_check(&mut tx, project).await?;
        }

        let snapshot_json = serde_json::to_value(snapshot)?;
        sqlx::query(
            r#"
            insert into rollups (
                overall_state,
                checked_at,
                operational_count,
                degraded_count,
                down_count,
                maintenance_count,
                unknown_count,
                snapshot
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(snapshot.overall_state.as_str())
        .bind(snapshot.checked_at)
        .bind(snapshot.summary.operational as i32)
        .bind(snapshot.summary.degraded as i32)
        .bind(snapshot.summary.down as i32)
        .bind(snapshot.summary.maintenance as i32)
        .bind(snapshot.summary.unknown as i32)
        .bind(snapshot_json)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn prune_check_runs(&self, retention_days: u32) -> Result<u64, StoreError> {
        let result = sqlx::query(
            r#"
            delete from check_runs
            where checked_at < now() - make_interval(days => $1)
            "#,
        )
        .bind(retention_days as i32)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn recent_incidents(&self) -> Result<Vec<IncidentRecord>, StoreError> {
        let incidents = sqlx::query_as::<_, IncidentRecord>(
            r#"
            select title, affected_targets, state, started_at, resolved_at, public_notes
            from incidents
            order by started_at desc
            limit 25
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(incidents)
    }

    pub async fn maintenance_windows(&self) -> Result<Vec<MaintenanceWindow>, StoreError> {
        let windows = sqlx::query_as::<_, MaintenanceWindow>(
            r#"
            select title, affected_targets, state, starts_at, ends_at, public_notes
            from maintenance_windows
            where ends_at >= now() - interval '30 days'
            order by starts_at desc
            limit 25
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(windows)
    }

    pub async fn recent_deployments(&self) -> Result<Vec<DeploymentEvent>, StoreError> {
        let deployments = sqlx::query_as::<_, DeploymentEvent>(
            r#"
            select service_id, repo_name, commit_sha, environment, deployed_at, public_summary
            from deployment_events
            order by deployed_at desc
            limit 50
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(deployments)
    }

    pub async fn record_deployment(&self, deployment: &DeploymentEvent) -> Result<(), StoreError> {
        sqlx::query(
            r#"
            insert into deployment_events (
                service_id,
                repo_name,
                commit_sha,
                environment,
                deployed_at,
                public_summary
            )
            values ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(&deployment.service_id)
        .bind(&deployment.repo_name)
        .bind(&deployment.commit_sha)
        .bind(&deployment.environment)
        .bind(deployment.deployed_at)
        .bind(&deployment.public_summary)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

async fn upsert_service_target(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    service: &ServiceStatus,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        insert into targets (
            id,
            name,
            target_kind,
            group_name,
            public_url,
            probe_url,
            first_seen_at,
            last_seen_at
        )
        values ($1, $2, 'public-http', $3, $4, $5, $6, $6)
        on conflict (id) do update set
            name = excluded.name,
            target_kind = excluded.target_kind,
            group_name = excluded.group_name,
            public_url = excluded.public_url,
            probe_url = excluded.probe_url,
            last_seen_at = excluded.last_seen_at
        "#,
    )
    .bind(service.target.id)
    .bind(service.target.name)
    .bind(service.target.group)
    .bind(service.target.public_url)
    .bind(service.target.probe_url)
    .bind(service.check.checked_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_project_target(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    project: &ProjectStatus,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        insert into targets (
            id,
            name,
            target_kind,
            public_url,
            repo_name,
            first_seen_at,
            last_seen_at
        )
        values ($1, $2, 'project', $3, $4, $5, $5)
        on conflict (id) do update set
            name = excluded.name,
            target_kind = excluded.target_kind,
            public_url = excluded.public_url,
            repo_name = excluded.repo_name,
            last_seen_at = excluded.last_seen_at
        "#,
    )
    .bind(project.target.id)
    .bind(project.target.name)
    .bind(project.target.public_url)
    .bind(project.target.repo_name)
    .bind(project.checked_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn insert_service_check(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    service: &ServiceStatus,
) -> Result<(), StoreError> {
    insert_check_run(
        tx,
        NewCheckRun {
            target_id: service.check.target_id,
            check_kind: service.check.check_kind.as_str(),
            state: service.check.state.as_str(),
            checked_at: service.check.checked_at,
            latency_ms: service.check.latency_ms,
            reason: &service.check.reason,
            probe_version: service.check.probe_version,
            public_payload: serde_json::to_value(service)?,
        },
    )
    .await
}

async fn insert_project_check(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    project: &ProjectStatus,
) -> Result<(), StoreError> {
    insert_check_run(
        tx,
        NewCheckRun {
            target_id: project.target.id,
            check_kind: "git",
            state: project.state.as_str(),
            checked_at: project.checked_at,
            latency_ms: None,
            reason: &project.reason,
            probe_version: project.probe_version,
            public_payload: json!({
                "git": project.git,
                "build": project.build,
            }),
        },
    )
    .await
}

struct NewCheckRun<'a> {
    target_id: &'a str,
    check_kind: &'a str,
    state: &'a str,
    checked_at: DateTime<Utc>,
    latency_ms: Option<u64>,
    reason: &'a str,
    probe_version: &'a str,
    public_payload: serde_json::Value,
}

async fn insert_check_run(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    check: NewCheckRun<'_>,
) -> Result<(), StoreError> {
    sqlx::query(
        r#"
        insert into check_runs (
            target_id,
            check_kind,
            state,
            checked_at,
            latency_ms,
            reason,
            probe_version,
            public_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(check.target_id)
    .bind(check.check_kind)
    .bind(check.state)
    .bind(check.checked_at)
    .bind(check.latency_ms.map(|value| value as i64))
    .bind(check.reason)
    .bind(check.probe_version)
    .bind(check.public_payload)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("postgresql operation failed: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("status payload could not be serialized: {0}")]
    Json(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        BuildProgress, CheckKind, CheckResult, GitStatus, MonitorTarget, ProjectTarget, StatusState,
    };
    use chrono::TimeZone;

    #[tokio::test]
    #[ignore = "requires a local PostgreSQL server and STATUS_TEST_DATABASE_URL"]
    async fn migrates_records_and_prunes_against_postgres() {
        let admin_url = std::env::var("STATUS_TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://sawyer@localhost/postgres".to_owned());
        let admin = PgPool::connect(&admin_url).await.expect("admin pool");
        let database_name = format!(
            "status_web_test_{}_{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().expect("nanos")
        );

        create_database(&admin, &database_name).await;
        let database_url = admin_url.replace("/postgres", &format!("/{database_name}"));
        let test_result = async {
            let store = StatusStore::connect(&database_url).await?;
            store.migrate().await?;
            store.record_snapshot(&snapshot_fixture()).await?;
            store
                .record_deployment(&DeploymentEvent {
                    service_id: Some("status-dunamismax".to_owned()),
                    repo_name: Some("status.dunamismax".to_owned()),
                    commit_sha: Some("abcdef1234567890".to_owned()),
                    environment: "production".to_owned(),
                    deployed_at: Utc.with_ymd_and_hms(2026, 5, 18, 12, 30, 0).unwrap(),
                    public_summary: "status deployed".to_owned(),
                })
                .await?;
            let target_count: i64 = sqlx::query_scalar("select count(*) from targets")
                .fetch_one(&store.pool)
                .await?;
            let check_count: i64 = sqlx::query_scalar("select count(*) from check_runs")
                .fetch_one(&store.pool)
                .await?;
            let rollup_count: i64 = sqlx::query_scalar("select count(*) from rollups")
                .fetch_one(&store.pool)
                .await?;
            let incidents = store.recent_incidents().await?;
            let maintenance = store.maintenance_windows().await?;
            let deployments = store.recent_deployments().await?;

            assert_eq!(target_count, 2);
            assert_eq!(check_count, 2);
            assert_eq!(rollup_count, 1);
            assert!(incidents.is_empty());
            assert!(maintenance.is_empty());
            assert_eq!(deployments.len(), 1);
            assert_eq!(
                deployments[0].service_id.as_deref(),
                Some("status-dunamismax")
            );
            assert_eq!(store.prune_check_runs(30).await?, 0);
            Ok::<(), StoreError>(())
        }
        .await;

        drop_database(&admin, &database_name).await;
        test_result.expect("store integration");
    }

    async fn create_database(admin: &PgPool, database_name: &str) {
        sqlx::query(&format!(r#"create database "{database_name}""#))
            .execute(admin)
            .await
            .expect("create database");
    }

    async fn drop_database(admin: &PgPool, database_name: &str) {
        sqlx::query(
            r#"
            select pg_terminate_backend(pid)
            from pg_stat_activity
            where datname = $1
            "#,
        )
        .bind(database_name)
        .execute(admin)
        .await
        .expect("terminate test connections");
        sqlx::query(&format!(r#"drop database if exists "{database_name}""#))
            .execute(admin)
            .await
            .expect("drop database");
    }

    fn snapshot_fixture() -> StatusSnapshot {
        let checked_at = Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        StatusSnapshot::from_services_and_projects(
            vec![ServiceStatus {
                target: MonitorTarget {
                    id: "fileferry-app",
                    name: "fileferry.app",
                    group: "Public websites",
                    public_url: "https://fileferry.app",
                    probe_url: "https://fileferry.app/healthz",
                    expected_status: 200,
                    expected_body_token: None,
                },
                check: CheckResult {
                    target_id: "fileferry-app",
                    check_kind: CheckKind::Http,
                    state: StatusState::Operational,
                    checked_at,
                    latency_ms: Some(42),
                    reason: "HTTP 200".to_owned(),
                    probe_version: "test",
                },
            }],
            vec![ProjectStatus {
                target: ProjectTarget {
                    id: "fileferry",
                    name: "fileferry",
                    repo_name: "fileferry",
                    public_url: Some("https://fileferry.app"),
                    repo_path: "/home/sawyer/github/fileferry".to_owned(),
                },
                state: StatusState::Operational,
                checked_at,
                reason: "repository is current; BUILD progress 2/3".to_owned(),
                git: GitStatus {
                    branch: Some("main".to_owned()),
                    upstream: Some("origin/main".to_owned()),
                    ahead: Some(0),
                    behind: Some(0),
                    dirty: Some(false),
                    latest_commit_age_days: Some(1),
                    remote_reachable: Some(true),
                },
                build: Some(BuildProgress {
                    checked: 2,
                    total: 3,
                    next_phase: Some("Phase 5: Persistence And History".to_owned()),
                }),
                probe_version: "test",
            }],
        )
    }
}
