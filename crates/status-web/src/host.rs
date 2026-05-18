use std::{collections::HashMap, process::ExitStatus, time::Duration};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{process::Command, time::Instant};

use crate::model::StatusState;

const SYSTEMD_PROBE_VERSION: &str = "systemd-v1";
const DOCKER_COMPOSE_PROBE_VERSION: &str = "docker-compose-v1";
const HOST_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostCheckKind {
    Systemd,
    DockerCompose,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HostCheckResult {
    pub target_id: &'static str,
    pub check_kind: HostCheckKind,
    pub state: StatusState,
    pub checked_at: DateTime<Utc>,
    pub duration_ms: Option<u64>,
    pub reason: String,
    pub probe_version: &'static str,
    #[serde(skip_serializing)]
    pub private_detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemdUnitPolicy {
    LongRunning,
    SuccessfulOneShot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SystemdUnitTarget {
    pub id: &'static str,
    pub unit: &'static str,
    pub policy: SystemdUnitPolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DockerComposeServiceTarget {
    pub id: &'static str,
    pub service: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ServiceMapping {
    pub public_target_id: &'static str,
    pub systemd_units: &'static [&'static str],
    pub compose_services: &'static [&'static str],
}

#[derive(Debug, Error)]
pub enum HostProbeError {
    #[error("host probe command timed out")]
    Timeout,
    #[error("host probe command could not start: {0}")]
    Io(#[from] std::io::Error),
    #[error("docker compose JSON could not be parsed: {0}")]
    DockerJson(#[from] serde_json::Error),
}

pub fn systemd_targets() -> Vec<SystemdUnitTarget> {
    vec![
        long_running("dunamismax-site", "dunamismax-site.service"),
        long_running("ferry-site", "ferry-site.service"),
        long_running("callrift", "callrift.service"),
        long_running("pod-tracker-web", "pod-tracker-web.service"),
        long_running("pod-tracker-worker", "pod-tracker-worker.service"),
        long_running("vane-web", "vane-web.service"),
        one_shot("vane-worker", "vane-worker.service"),
        long_running("vane-ssh", "vane-ssh.service"),
        long_running("debugpath-site", "debugpath-site.service"),
        long_running("debugpath-ssh", "debugpath-ssh.service"),
        long_running("caddy", "caddy.service"),
        one_shot("cloudflare-ddns", "cloudflare-ddns.service"),
    ]
}

pub fn service_mappings() -> &'static [ServiceMapping] {
    const MAPPINGS: &[ServiceMapping] = &[
        ServiceMapping {
            public_target_id: "dunamismax-com",
            systemd_units: &["dunamismax-site.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "fileferry-app",
            systemd_units: &["ferry-site.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "callrift-dev",
            systemd_units: &["callrift.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "pod-tracker-app",
            systemd_units: &["pod-tracker-web.service", "pod-tracker-worker.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "langindex-dev",
            systemd_units: &[],
            compose_services: &["langindex"],
        },
        ServiceMapping {
            public_target_id: "0xvane-dev",
            systemd_units: &[
                "vane-web.service",
                "vane-worker.service",
                "vane-ssh.service",
            ],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "debugpath-dev",
            systemd_units: &["debugpath-site.service", "debugpath-ssh.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "status-dunamismax-com",
            systemd_units: &["status-dunamismax.service"],
            compose_services: &[],
        },
    ];

    MAPPINGS
}

pub async fn probe_systemd_unit(target: SystemdUnitTarget) -> HostCheckResult {
    let checked_at = Utc::now();
    let started = Instant::now();
    let args = [
        "show",
        target.unit,
        "--property=LoadState",
        "--property=ActiveState",
        "--property=SubState",
        "--property=Result",
        "--property=ExecMainStatus",
        "--property=NRestarts",
        "--property=ActiveEnterTimestamp",
        "--property=InactiveExitTimestamp",
    ];

    match run_command("systemctl", &args).await {
        Ok(output) if output.status.success() => {
            let facts = SystemdFacts::parse(&output.stdout);
            evaluate_systemd_facts(target, checked_at, Some(started.elapsed()), facts)
        }
        Ok(output) => command_failed_result(
            target.id,
            HostCheckKind::Systemd,
            checked_at,
            Some(started.elapsed()),
            SYSTEMD_PROBE_VERSION,
            "systemd state unavailable",
            output.private_detail(),
        ),
        Err(error) => command_failed_result(
            target.id,
            HostCheckKind::Systemd,
            checked_at,
            Some(started.elapsed()),
            SYSTEMD_PROBE_VERSION,
            "systemd state unavailable",
            Some(error.to_string()),
        ),
    }
}

pub async fn probe_docker_compose_service(
    target: DockerComposeServiceTarget,
    compose_file: &str,
) -> HostCheckResult {
    let checked_at = Utc::now();
    let started = Instant::now();
    let args = [
        "compose",
        "--file",
        compose_file,
        "ps",
        "--format",
        "json",
        target.service,
    ];

    match run_command("docker", &args).await {
        Ok(output) if output.status.success() => match parse_compose_ps_json(&output.stdout) {
            Ok(services) => {
                evaluate_compose_service(target, checked_at, Some(started.elapsed()), &services)
            }
            Err(error) => command_failed_result(
                target.id,
                HostCheckKind::DockerCompose,
                checked_at,
                Some(started.elapsed()),
                DOCKER_COMPOSE_PROBE_VERSION,
                "docker compose state unavailable",
                Some(error.to_string()),
            ),
        },
        Ok(output) => command_failed_result(
            target.id,
            HostCheckKind::DockerCompose,
            checked_at,
            Some(started.elapsed()),
            DOCKER_COMPOSE_PROBE_VERSION,
            "docker compose state unavailable",
            output.private_detail(),
        ),
        Err(error) => command_failed_result(
            target.id,
            HostCheckKind::DockerCompose,
            checked_at,
            Some(started.elapsed()),
            DOCKER_COMPOSE_PROBE_VERSION,
            "docker compose state unavailable",
            Some(error.to_string()),
        ),
    }
}

fn long_running(id: &'static str, unit: &'static str) -> SystemdUnitTarget {
    SystemdUnitTarget {
        id,
        unit,
        policy: SystemdUnitPolicy::LongRunning,
    }
}

fn one_shot(id: &'static str, unit: &'static str) -> SystemdUnitTarget {
    SystemdUnitTarget {
        id,
        unit,
        policy: SystemdUnitPolicy::SuccessfulOneShot,
    }
}

fn evaluate_systemd_facts(
    target: SystemdUnitTarget,
    checked_at: DateTime<Utc>,
    duration: Option<Duration>,
    facts: SystemdFacts,
) -> HostCheckResult {
    let load_state = facts.value("LoadState");
    let active_state = facts.value("ActiveState");
    let result = facts.value("Result").unwrap_or("success");
    let exec_status = facts
        .value("ExecMainStatus")
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(0);
    let restarts = facts
        .value("NRestarts")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    let (state, reason) = if load_state != Some("loaded") {
        (StatusState::Unknown, "unit is not loaded")
    } else {
        match target.policy {
            SystemdUnitPolicy::LongRunning => {
                evaluate_long_running_unit(active_state, result, restarts)
            }
            SystemdUnitPolicy::SuccessfulOneShot => {
                evaluate_successful_one_shot(active_state, result, exec_status)
            }
        }
    };

    HostCheckResult {
        target_id: target.id,
        check_kind: HostCheckKind::Systemd,
        state,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason: reason.to_owned(),
        probe_version: SYSTEMD_PROBE_VERSION,
        private_detail: None,
    }
}

fn evaluate_long_running_unit(
    active_state: Option<&str>,
    result: &str,
    restarts: u64,
) -> (StatusState, &'static str) {
    match active_state {
        Some("active") if result == "success" && restarts < 5 => {
            (StatusState::Operational, "unit is active")
        }
        Some("active") => (
            StatusState::Degraded,
            "unit is active but restart or result evidence needs attention",
        ),
        Some("reloading" | "activating" | "deactivating") => {
            (StatusState::Degraded, "unit is transitioning")
        }
        Some("failed") => (StatusState::Down, "unit failed"),
        Some("inactive") => (StatusState::Down, "unit is inactive"),
        _ => (StatusState::Unknown, "unit state is unknown"),
    }
}

fn evaluate_successful_one_shot(
    active_state: Option<&str>,
    result: &str,
    exec_status: i32,
) -> (StatusState, &'static str) {
    match (active_state, result, exec_status) {
        (Some("active" | "activating"), _, _) => (StatusState::Operational, "one-shot is running"),
        (_, "success", 0) => (StatusState::Operational, "latest one-shot run succeeded"),
        (Some("failed"), _, _) | (_, _, 1..) | (_, "exit-code" | "signal" | "timeout", _) => {
            (StatusState::Down, "latest one-shot run failed")
        }
        _ => (StatusState::Unknown, "latest one-shot result is unknown"),
    }
}

fn evaluate_compose_service(
    target: DockerComposeServiceTarget,
    checked_at: DateTime<Utc>,
    duration: Option<Duration>,
    services: &[DockerComposeFacts],
) -> HostCheckResult {
    let service = services
        .iter()
        .find(|service| service.service.as_deref() == Some(target.service));

    let (state, reason) = match service {
        None => (StatusState::Unknown, "compose service was not reported"),
        Some(service) => evaluate_compose_facts(service),
    };

    HostCheckResult {
        target_id: target.id,
        check_kind: HostCheckKind::DockerCompose,
        state,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason: reason.to_owned(),
        probe_version: DOCKER_COMPOSE_PROBE_VERSION,
        private_detail: None,
    }
}

fn evaluate_compose_facts(service: &DockerComposeFacts) -> (StatusState, &'static str) {
    let state = service.state.as_deref().unwrap_or_default();
    let health = service.health.as_deref().unwrap_or_default();

    match (state, health) {
        ("running", "" | "healthy") => (StatusState::Operational, "container is running"),
        ("running", "starting") => (StatusState::Degraded, "container health is starting"),
        ("running", "unhealthy") => (StatusState::Down, "container health is unhealthy"),
        ("restarting" | "paused", _) => (StatusState::Degraded, "container is not steady"),
        ("exited" | "dead", _) => (StatusState::Down, "container is not running"),
        _ => (StatusState::Unknown, "container state is unknown"),
    }
}

fn command_failed_result(
    target_id: &'static str,
    check_kind: HostCheckKind,
    checked_at: DateTime<Utc>,
    duration: Option<Duration>,
    probe_version: &'static str,
    reason: &'static str,
    private_detail: Option<String>,
) -> HostCheckResult {
    HostCheckResult {
        target_id,
        check_kind,
        state: StatusState::Unknown,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason: reason.to_owned(),
        probe_version,
        private_detail,
    }
}

fn duration_ms(duration: Duration) -> u64 {
    duration.as_millis() as u64
}

async fn run_command(program: &str, args: &[&str]) -> Result<CommandCapture, HostProbeError> {
    let output = tokio::time::timeout(
        HOST_COMMAND_TIMEOUT,
        Command::new(program).args(args).output(),
    )
    .await
    .map_err(|_| HostProbeError::Timeout)??;

    Ok(CommandCapture {
        status: output.status,
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CommandCapture {
    status: ExitStatus,
    stdout: String,
    stderr: String,
}

impl CommandCapture {
    fn private_detail(&self) -> Option<String> {
        let detail = format!("status: {}; stderr: {}", self.status, self.stderr.trim());
        Some(detail)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct SystemdFacts {
    values: HashMap<String, String>,
}

impl SystemdFacts {
    fn parse(input: &str) -> Self {
        let values = input
            .lines()
            .filter_map(|line| line.split_once('='))
            .map(|(key, value)| (key.trim().to_owned(), value.trim().to_owned()))
            .collect();

        Self { values }
    }

    fn value(&self, key: &str) -> Option<&str> {
        self.values.get(key).map(String::as_str)
    }
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
struct DockerComposeFacts {
    #[serde(default, alias = "Service")]
    service: Option<String>,
    #[serde(default, alias = "State")]
    state: Option<String>,
    #[serde(default, alias = "Health")]
    health: Option<String>,
}

fn parse_compose_ps_json(input: &str) -> Result<Vec<DockerComposeFacts>, HostProbeError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    if trimmed.starts_with('[') {
        return Ok(serde_json::from_str(trimmed)?);
    }

    trimmed
        .lines()
        .map(serde_json::from_str)
        .collect::<Result<Vec<_>, _>>()
        .map_err(HostProbeError::DockerJson)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checked_at() -> DateTime<Utc> {
        DateTime::from_timestamp(1_779_120_000, 0).expect("timestamp")
    }

    #[test]
    fn systemd_long_running_active_unit_is_operational() {
        let facts = SystemdFacts::parse(
            r#"LoadState=loaded
ActiveState=active
SubState=running
Result=success
ExecMainStatus=0
NRestarts=0
"#,
        );

        let result = evaluate_systemd_facts(
            long_running("callrift", "callrift.service"),
            checked_at(),
            Some(Duration::from_millis(7)),
            facts,
        );

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "unit is active");
        assert_eq!(result.duration_ms, Some(7));
    }

    #[test]
    fn systemd_restart_evidence_degrades_running_unit() {
        let facts = SystemdFacts::parse(
            r#"LoadState=loaded
ActiveState=active
Result=success
ExecMainStatus=0
NRestarts=8
"#,
        );

        let result = evaluate_systemd_facts(
            long_running("callrift", "callrift.service"),
            checked_at(),
            None,
            facts,
        );

        assert_eq!(result.state, StatusState::Degraded);
        assert!(result.reason.contains("needs attention"));
    }

    #[test]
    fn systemd_one_shot_success_is_operational_when_inactive() {
        let facts = SystemdFacts::parse(
            r#"LoadState=loaded
ActiveState=inactive
Result=success
ExecMainStatus=0
"#,
        );

        let result = evaluate_systemd_facts(
            one_shot("cloudflare-ddns", "cloudflare-ddns.service"),
            checked_at(),
            None,
            facts,
        );

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "latest one-shot run succeeded");
    }

    #[test]
    fn systemd_failure_reason_is_public_safe() {
        let result = command_failed_result(
            "callrift",
            HostCheckKind::Systemd,
            checked_at(),
            None,
            SYSTEMD_PROBE_VERSION,
            "systemd state unavailable",
            Some("journal contains private path /home/sawyer/secret".to_owned()),
        );

        assert_eq!(result.reason, "systemd state unavailable");
        assert!(!result.reason.contains("/home/sawyer"));
        assert!(
            result
                .private_detail
                .expect("detail")
                .contains("/home/sawyer")
        );
    }

    #[test]
    fn compose_array_json_marks_healthy_running_service_operational() {
        let services = parse_compose_ps_json(
            r#"[{"Service":"langindex","State":"running","Health":"healthy"}]"#,
        )
        .expect("compose JSON");

        let result = evaluate_compose_service(
            DockerComposeServiceTarget {
                id: "langindex",
                service: "langindex",
            },
            checked_at(),
            None,
            &services,
        );

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "container is running");
    }

    #[test]
    fn compose_newline_json_marks_unhealthy_service_down() {
        let services = parse_compose_ps_json(
            r#"{"Service":"langindex","State":"running","Health":"unhealthy"}
{"Service":"postgres","State":"running","Health":"healthy"}"#,
        )
        .expect("compose JSON lines");

        let result = evaluate_compose_service(
            DockerComposeServiceTarget {
                id: "langindex",
                service: "langindex",
            },
            checked_at(),
            None,
            &services,
        );

        assert_eq!(result.state, StatusState::Down);
        assert_eq!(result.reason, "container health is unhealthy");
    }

    #[test]
    fn mappings_cover_initial_public_targets() {
        let mappings = service_mappings();

        for target_id in [
            "dunamismax-com",
            "fileferry-app",
            "callrift-dev",
            "pod-tracker-app",
            "langindex-dev",
            "0xvane-dev",
            "debugpath-dev",
            "status-dunamismax-com",
        ] {
            assert!(
                mappings
                    .iter()
                    .any(|mapping| mapping.public_target_id == target_id),
                "{target_id}"
            );
        }
    }
}
