use std::time::Duration;

use chrono::{DateTime, Utc};
use reqwest::{Client, Url};
use serde::Serialize;
use thiserror::Error;

use crate::model::{StatusSnapshot, StatusState};

const WEBHOOK_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AlertSeverity {
    Warning,
    Critical,
}

impl AlertSeverity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Warning => "warning",
            Self::Critical => "critical",
        }
    }

    fn rank(self) -> u8 {
        match self {
            Self::Warning => 1,
            Self::Critical => 2,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AlertCandidate {
    pub dedup_key: String,
    pub target_id: String,
    pub target_name: String,
    pub severity: AlertSeverity,
    pub state: StatusState,
    pub observed_at: DateTime<Utc>,
    pub title: String,
    pub public_summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlertConfig {
    pub webhook_url: Option<String>,
    pub repeat_after_minutes: u32,
    pub max_notifications_per_run: u32,
}

impl AlertConfig {
    pub fn notifications_enabled(&self) -> bool {
        self.webhook_url.is_some()
    }
}

#[derive(Debug, Clone)]
pub struct WebhookNotifier {
    client: Client,
    webhook_url: Url,
}

impl WebhookNotifier {
    pub fn new(webhook_url: &str) -> Result<Self, AlertError> {
        let webhook_url =
            Url::parse(webhook_url).map_err(|error| AlertError::WebhookUrl(error.to_string()))?;
        if !matches!(webhook_url.scheme(), "https" | "http") {
            return Err(AlertError::WebhookScheme);
        }

        let client = Client::builder()
            .timeout(WEBHOOK_TIMEOUT)
            .user_agent("status.dunamismax/0.1 alert-webhook")
            .build()?;

        Ok(Self {
            client,
            webhook_url,
        })
    }

    pub async fn send(&self, alert: &AlertCandidate) -> Result<(), AlertError> {
        self.client
            .post(self.webhook_url.clone())
            .json(&AlertWebhookPayload::from(alert))
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }
}

pub fn evaluate_alerts(snapshot: &StatusSnapshot) -> Vec<AlertCandidate> {
    let mut alerts = Vec::new();

    for service in &snapshot.services {
        let Some(severity) = severity_for_state(service.check.state) else {
            continue;
        };
        let state = service.check.state;
        alerts.push(AlertCandidate {
            dedup_key: format!("service:{}:{}", service.target.id, state.as_str()),
            target_id: service.target.id.to_owned(),
            target_name: service.target.name.to_owned(),
            severity,
            state,
            observed_at: service.check.checked_at,
            title: format!("{} is {}", service.target.name, state.as_str()),
            public_summary: format!(
                "{} is {}: {}",
                service.target.name,
                state.as_str(),
                service.check.reason
            ),
        });
    }

    for project in &snapshot.projects {
        let Some(severity) = severity_for_state(project.state) else {
            continue;
        };
        let state = project.state;
        alerts.push(AlertCandidate {
            dedup_key: format!("project:{}:{}", project.target.id, state.as_str()),
            target_id: project.target.id.to_owned(),
            target_name: project.target.name.to_owned(),
            severity,
            state,
            observed_at: project.checked_at,
            title: format!("{} is {}", project.target.name, state.as_str()),
            public_summary: format!(
                "{} is {}: {}",
                project.target.name,
                state.as_str(),
                project.reason
            ),
        });
    }

    alerts.sort_by(|left, right| {
        right
            .severity
            .rank()
            .cmp(&left.severity.rank())
            .then_with(|| left.target_name.cmp(&right.target_name))
    });
    alerts
}

fn severity_for_state(state: StatusState) -> Option<AlertSeverity> {
    match state {
        StatusState::Down => Some(AlertSeverity::Critical),
        StatusState::Degraded | StatusState::Unknown => Some(AlertSeverity::Warning),
        StatusState::Operational | StatusState::Maintenance => None,
    }
}

#[derive(Debug, Serialize)]
struct AlertWebhookPayload<'a> {
    source: &'static str,
    severity: &'static str,
    state: &'static str,
    target_id: &'a str,
    target_name: &'a str,
    title: &'a str,
    public_summary: &'a str,
    observed_at: DateTime<Utc>,
}

impl<'a> From<&'a AlertCandidate> for AlertWebhookPayload<'a> {
    fn from(alert: &'a AlertCandidate) -> Self {
        Self {
            source: "status.dunamismax.com",
            severity: alert.severity.as_str(),
            state: alert.state.as_str(),
            target_id: &alert.target_id,
            target_name: &alert.target_name,
            title: &alert.title,
            public_summary: &alert.public_summary,
            observed_at: alert.observed_at,
        }
    }
}

#[derive(Debug, Error)]
pub enum AlertError {
    #[error("alert webhook URL is invalid: {0}")]
    WebhookUrl(String),
    #[error("alert webhook URL must use http or https")]
    WebhookScheme,
    #[error("alert webhook request failed: {0}")]
    Http(#[from] reqwest::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, routing::post};
    use chrono::TimeZone;
    use serde_json::Value;
    use std::sync::{Arc, Mutex};
    use tokio::net::TcpListener;

    use crate::model::{
        BuildProgress, CheckKind, CheckResult, GitStatus, MonitorTarget, ProjectStatus,
        ProjectTarget, ServiceStatus,
    };

    #[test]
    fn evaluates_down_and_degraded_alerts_with_public_summaries() {
        let snapshot = snapshot_fixture();

        let alerts = evaluate_alerts(&snapshot);

        assert_eq!(alerts.len(), 2);
        assert_eq!(alerts[0].severity, AlertSeverity::Critical);
        assert_eq!(alerts[0].target_id, "status-dunamismax-com");
        assert!(alerts[0].public_summary.contains("expected HTTP 200"));
        assert_eq!(alerts[1].severity, AlertSeverity::Warning);
        assert_eq!(alerts[1].target_id, "fileferry");
        assert!(!alerts[1].public_summary.contains("/home/sawyer"));
    }

    #[tokio::test]
    async fn webhook_notifier_posts_public_safe_payload() {
        let received = Arc::new(Mutex::new(Vec::<Value>::new()));
        let app = Router::new().route(
            "/",
            post({
                let received = Arc::clone(&received);
                move |Json(payload): Json<Value>| async move {
                    received.lock().expect("received lock").push(payload);
                    "ok"
                }
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("listener");
        let addr = listener.local_addr().expect("local addr");
        tokio::spawn(async move {
            axum::serve(listener, app).await.expect("mock webhook");
        });

        let notifier = WebhookNotifier::new(&format!("http://{addr}/")).expect("notifier");
        notifier
            .send(&evaluate_alerts(&snapshot_fixture())[0])
            .await
            .expect("send alert");

        let payloads = received.lock().expect("received lock");
        assert_eq!(payloads.len(), 1);
        assert_eq!(payloads[0]["source"], "status.dunamismax.com");
        assert_eq!(payloads[0]["severity"], "critical");
        assert!(
            payloads[0]["public_summary"]
                .as_str()
                .unwrap()
                .contains("HTTP")
        );
        assert!(!payloads[0].to_string().contains("/home/sawyer"));
    }

    fn snapshot_fixture() -> StatusSnapshot {
        let checked_at = Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        StatusSnapshot::from_services_and_projects(
            vec![
                ServiceStatus {
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
                },
                ServiceStatus {
                    target: MonitorTarget {
                        id: "status-dunamismax-com",
                        name: "status.dunamismax.com",
                        group: "Public websites",
                        public_url: "https://status.dunamismax.com",
                        probe_url: "https://status.dunamismax.com/healthz",
                        expected_status: 200,
                        expected_body_token: None,
                    },
                    check: CheckResult {
                        target_id: "status-dunamismax-com",
                        check_kind: CheckKind::Http,
                        state: StatusState::Down,
                        checked_at,
                        latency_ms: None,
                        reason: "expected HTTP 200, got HTTP 503".to_owned(),
                        probe_version: "test",
                    },
                },
            ],
            vec![ProjectStatus {
                target: ProjectTarget {
                    id: "fileferry",
                    name: "fileferry",
                    repo_name: "fileferry",
                    public_url: Some("https://fileferry.app"),
                    repo_path: "/home/sawyer/github/fileferry".to_owned(),
                },
                state: StatusState::Degraded,
                checked_at,
                reason: "branch is 1 behind upstream".to_owned(),
                git: GitStatus {
                    branch: Some("main".to_owned()),
                    upstream: Some("origin/main".to_owned()),
                    ahead: Some(0),
                    behind: Some(1),
                    dirty: Some(false),
                    latest_commit_age_days: Some(1),
                    remote_reachable: Some(true),
                },
                build: Some(BuildProgress {
                    checked: 2,
                    total: 3,
                    next_phase: Some("Phase 8: Operator Boundary And Alerts".to_owned()),
                }),
                probe_version: "test",
            }],
        )
    }
}
