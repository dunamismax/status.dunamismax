use std::{sync::Arc, time::Duration};

use chrono::Utc;
use reqwest::{Client, StatusCode};
use tokio::{task::JoinSet, time::Instant};

use crate::{
    inventory::public_targets,
    model::{CheckKind, CheckResult, MonitorTarget, ServiceStatus, StatusSnapshot, StatusState},
};

const HTTP_PROBE_VERSION: &str = "public-http-v1";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct ProbeRunner {
    client: Client,
    timeout: Duration,
}

impl ProbeRunner {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("status.dunamismax/0.1 public-http-probe")
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("probe client configuration is valid");

        Self {
            client,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub async fn collect_public_status(&self) -> StatusSnapshot {
        StatusSnapshot::from_services(self.collect_public_services().await)
    }

    pub async fn collect_public_services(&self) -> Vec<ServiceStatus> {
        collect_targets(public_targets(), self.client.clone(), self.timeout).await
    }
}

impl Default for ProbeRunner {
    fn default() -> Self {
        Self::new()
    }
}

async fn collect_targets(
    targets: Vec<MonitorTarget>,
    client: Client,
    timeout: Duration,
) -> Vec<ServiceStatus> {
    let client = Arc::new(client);
    let mut checks = JoinSet::new();

    for target in targets {
        let client = Arc::clone(&client);
        checks.spawn(async move { probe_http_target(target, &client, timeout).await });
    }

    let mut services = Vec::new();
    while let Some(result) = checks.join_next().await {
        match result {
            Ok(service) => services.push(service),
            Err(error) => {
                tracing::warn!(%error, "public HTTP probe task failed");
            }
        }
    }

    services
}

async fn probe_http_target(
    target: MonitorTarget,
    client: &Client,
    timeout: Duration,
) -> ServiceStatus {
    let checked_at = Utc::now();
    let started = Instant::now();
    let outcome = tokio::time::timeout(timeout, client.get(target.probe_url).send()).await;

    let check = match outcome {
        Err(_) => CheckResult {
            target_id: target.id,
            check_kind: CheckKind::Http,
            state: StatusState::Down,
            checked_at,
            latency_ms: None,
            reason: "request timed out".to_owned(),
            probe_version: HTTP_PROBE_VERSION,
        },
        Ok(Err(error)) => CheckResult {
            target_id: target.id,
            check_kind: CheckKind::Http,
            state: StatusState::Down,
            checked_at,
            latency_ms: Some(started.elapsed().as_millis() as u64),
            reason: public_request_error_reason(&error),
            probe_version: HTTP_PROBE_VERSION,
        },
        Ok(Ok(response)) => {
            result_from_response(
                target.id,
                target.expected_status,
                target.expected_body_token,
                checked_at,
                started,
                response,
            )
            .await
        }
    };

    ServiceStatus { target, check }
}

async fn result_from_response(
    target_id: &'static str,
    expected_status: u16,
    expected_body_token: Option<&'static str>,
    checked_at: chrono::DateTime<Utc>,
    started: Instant,
    response: reqwest::Response,
) -> CheckResult {
    let status = response.status();
    let latency_ms = Some(started.elapsed().as_millis() as u64);

    if status != StatusCode::from_u16(expected_status).expect("inventory status code is valid") {
        let state = if status.is_server_error() {
            StatusState::Down
        } else {
            StatusState::Degraded
        };

        return CheckResult {
            target_id,
            check_kind: CheckKind::Http,
            state,
            checked_at,
            latency_ms,
            reason: format!(
                "expected HTTP {expected_status}, got HTTP {}",
                status.as_u16()
            ),
            probe_version: HTTP_PROBE_VERSION,
        };
    }

    if let Some(token) = expected_body_token {
        match response.text().await {
            Ok(body) if body.contains(token) => {}
            Ok(_) => {
                return CheckResult {
                    target_id,
                    check_kind: CheckKind::Http,
                    state: StatusState::Degraded,
                    checked_at,
                    latency_ms,
                    reason: "expected response token was missing".to_owned(),
                    probe_version: HTTP_PROBE_VERSION,
                };
            }
            Err(_) => {
                return CheckResult {
                    target_id,
                    check_kind: CheckKind::Http,
                    state: StatusState::Unknown,
                    checked_at,
                    latency_ms,
                    reason: "response body could not be read".to_owned(),
                    probe_version: HTTP_PROBE_VERSION,
                };
            }
        }
    }

    CheckResult {
        target_id,
        check_kind: CheckKind::Http,
        state: StatusState::Operational,
        checked_at,
        latency_ms,
        reason: format!("HTTP {}", status.as_u16()),
        probe_version: HTTP_PROBE_VERSION,
    }
}

fn public_request_error_reason(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "request timed out".to_owned()
    } else if error.is_connect() {
        "DNS, TLS, or connection failed".to_owned()
    } else {
        "HTTP probe request failed".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_errors_are_public_safe() {
        let reason = public_request_error_reason(
            &Client::new()
                .get("not a url")
                .build()
                .expect_err("relative request build should fail"),
        );

        assert!(!reason.contains("127.0.0.1"));
    }
}
