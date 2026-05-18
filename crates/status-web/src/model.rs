use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusState {
    Operational,
    Degraded,
    Down,
    Maintenance,
    Unknown,
}

impl StatusState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Operational => "operational",
            Self::Degraded => "degraded",
            Self::Down => "down",
            Self::Maintenance => "maintenance",
            Self::Unknown => "unknown",
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::Operational => 0,
            Self::Maintenance => 1,
            Self::Unknown => 2,
            Self::Degraded => 3,
            Self::Down => 4,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CheckKind {
    Http,
    Git,
    Systemd,
    DockerCompose,
    Caddy,
    CloudflareDdns,
}

impl CheckKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Http => "http",
            Self::Git => "git",
            Self::Systemd => "systemd",
            Self::DockerCompose => "docker-compose",
            Self::Caddy => "caddy",
            Self::CloudflareDdns => "cloudflare-ddns",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MonitorTarget {
    pub id: &'static str,
    pub name: &'static str,
    pub group: &'static str,
    pub public_url: &'static str,
    pub probe_url: &'static str,
    pub expected_status: u16,
    #[serde(skip_serializing)]
    pub expected_body_token: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CheckResult {
    pub target_id: &'static str,
    pub check_kind: CheckKind,
    pub state: StatusState,
    pub checked_at: DateTime<Utc>,
    pub latency_ms: Option<u64>,
    pub reason: String,
    pub probe_version: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServiceStatus {
    pub target: MonitorTarget,
    pub check: CheckResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectTarget {
    pub id: &'static str,
    pub name: &'static str,
    pub repo_name: &'static str,
    pub public_url: Option<&'static str>,
    #[serde(skip_serializing)]
    pub repo_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BuildProgress {
    pub checked: usize,
    pub total: usize,
    pub next_phase: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub dirty: Option<bool>,
    pub latest_commit_age_days: Option<i64>,
    pub remote_reachable: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProjectStatus {
    pub target: ProjectTarget,
    pub state: StatusState,
    pub checked_at: DateTime<Utc>,
    pub reason: String,
    pub git: GitStatus,
    pub build: Option<BuildProgress>,
    pub probe_version: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, sqlx::FromRow)]
pub struct IncidentRecord {
    pub title: String,
    pub affected_targets: Vec<String>,
    pub state: String,
    pub started_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub public_notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, sqlx::FromRow)]
pub struct MaintenanceWindow {
    pub title: String,
    pub affected_targets: Vec<String>,
    pub state: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub public_notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, sqlx::FromRow)]
pub struct DeploymentEvent {
    pub service_id: Option<String>,
    pub repo_name: Option<String>,
    pub commit_sha: Option<String>,
    pub environment: String,
    pub deployed_at: DateTime<Utc>,
    pub public_summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StatusSummary {
    pub operational: usize,
    pub degraded: usize,
    pub down: usize,
    pub maintenance: usize,
    pub unknown: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StatusSnapshot {
    pub overall_state: StatusState,
    pub checked_at: DateTime<Utc>,
    pub summary: StatusSummary,
    pub services: Vec<ServiceStatus>,
    pub projects: Vec<ProjectStatus>,
}

impl StatusSnapshot {
    pub fn from_services(services: Vec<ServiceStatus>) -> Self {
        Self::from_services_and_projects(services, Vec::new())
    }

    pub fn from_services_and_projects(
        mut services: Vec<ServiceStatus>,
        mut projects: Vec<ProjectStatus>,
    ) -> Self {
        services.sort_by(|left, right| left.target.name.cmp(right.target.name));
        projects.sort_by(|left, right| left.target.name.cmp(right.target.name));

        let checked_at = services
            .iter()
            .map(|service| service.check.checked_at)
            .chain(projects.iter().map(|project| project.checked_at))
            .max()
            .unwrap_or_else(Utc::now);
        let summary = StatusSummary::from_services(&services);
        let overall_state = services
            .iter()
            .map(|service| service.check.state)
            .chain(projects.iter().map(|project| project.state))
            .max_by_key(|state| state.rank())
            .unwrap_or(StatusState::Unknown);

        Self {
            overall_state,
            checked_at,
            summary,
            services,
            projects,
        }
    }
}

impl StatusSummary {
    fn from_services(services: &[ServiceStatus]) -> Self {
        let mut summary = Self {
            operational: 0,
            degraded: 0,
            down: 0,
            maintenance: 0,
            unknown: 0,
        };

        for service in services {
            match service.check.state {
                StatusState::Operational => summary.operational += 1,
                StatusState::Degraded => summary.degraded += 1,
                StatusState::Down => summary.down += 1,
                StatusState::Maintenance => summary.maintenance += 1,
                StatusState::Unknown => summary.unknown += 1,
            }
        }

        summary
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rollup_uses_most_severe_observed_state() {
        let checked_at = Utc::now();
        let target = MonitorTarget {
            id: "example",
            name: "Example",
            group: "Sites",
            public_url: "https://example.com",
            probe_url: "https://example.com/healthz",
            expected_status: 200,
            expected_body_token: None,
        };
        let services = vec![
            ServiceStatus {
                target: target.clone(),
                check: CheckResult {
                    target_id: "example",
                    check_kind: CheckKind::Http,
                    state: StatusState::Operational,
                    checked_at,
                    latency_ms: Some(10),
                    reason: "HTTP 200".to_owned(),
                    probe_version: "test",
                },
            },
            ServiceStatus {
                target,
                check: CheckResult {
                    target_id: "example",
                    check_kind: CheckKind::Http,
                    state: StatusState::Down,
                    checked_at,
                    latency_ms: None,
                    reason: "request timed out".to_owned(),
                    probe_version: "test",
                },
            },
        ];

        let snapshot = StatusSnapshot::from_services(services);

        assert_eq!(snapshot.overall_state, StatusState::Down);
        assert_eq!(snapshot.summary.operational, 1);
        assert_eq!(snapshot.summary.down, 1);
    }
}
