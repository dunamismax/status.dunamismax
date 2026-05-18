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
#[serde(rename_all = "lowercase")]
pub enum CheckKind {
    Http,
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
}

impl StatusSnapshot {
    pub fn from_services(mut services: Vec<ServiceStatus>) -> Self {
        services.sort_by(|left, right| left.target.name.cmp(right.target.name));

        let checked_at = services
            .iter()
            .map(|service| service.check.checked_at)
            .max()
            .unwrap_or_else(Utc::now);
        let summary = StatusSummary::from_services(&services);
        let overall_state = services
            .iter()
            .map(|service| service.check.state)
            .max_by_key(|state| state.rank())
            .unwrap_or(StatusState::Unknown);

        Self {
            overall_state,
            checked_at,
            summary,
            services,
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
