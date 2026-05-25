use std::{collections::HashMap, process::ExitStatus, time::Duration};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{process::Command, time::Instant};

use crate::model::StatusState;

const SYSTEMD_PROBE_VERSION: &str = "systemd-v1";
const DOCKER_COMPOSE_PROBE_VERSION: &str = "docker-compose-v1";
const CADDY_PROBE_VERSION: &str = "caddy-v1";
const CLOUDFLARE_DDNS_PROBE_VERSION: &str = "cloudflare-ddns-v1";
const DISK_PROBE_VERSION: &str = "disk-v1";
const HOST_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostCheckKind {
    Systemd,
    DockerCompose,
    Caddy,
    CloudflareDdns,
    Disk,
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
    pub project: &'static str,
    pub service: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaddyProbeTarget {
    pub id: &'static str,
    pub config_path: &'static str,
    pub unit: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CloudflareDdnsTarget {
    pub id: &'static str,
    pub unit: &'static str,
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
        long_running("fileferry-web", "fileferry-web.service"),
        long_running("callrift", "callrift.service"),
        long_running("pod-tracker-web", "pod-tracker-web.service"),
        long_running("pod-tracker-worker", "pod-tracker-worker.service"),
        long_running("status-dunamismax", "status-dunamismax.service"),
        long_running("mtg-card-bot", "mtg-card-bot.service"),
        long_running("docker", "docker.service"),
        long_running("containerd", "containerd.service"),
        long_running("postgresql", "postgresql.service"),
        long_running("postgresql-main", "postgresql@18-main.service"),
        long_running("callrift-postgres", "callrift-postgres.service"),
        long_running("caddy", "caddy.service"),
        long_running("ssh", "ssh.service"),
        long_running("tailscaled", "tailscaled.service"),
        long_running("fail2ban", "fail2ban.service"),
        one_shot("ufw", "ufw.service"),
        one_shot("cloudflare-ddns", "cloudflare-ddns.service"),
        one_shot("self-hosted-rust-sync", "self-hosted-rust-sync.service"),
        long_running("self-hosted-rust-sync-timer", "self-hosted-rust-sync.timer"),
        one_shot("server-disk-cleanup", "server-disk-cleanup.service"),
        long_running("server-disk-cleanup-timer", "server-disk-cleanup.timer"),
        one_shot(
            "rustdesk-preconfig-build",
            "rustdesk-preconfig-build.service",
        ),
        one_shot("callrift-backup", "callrift-backup.service"),
        long_running("callrift-backup-timer", "callrift-backup.timer"),
        one_shot(
            "loveward-postgres-backup",
            "loveward-postgres-backup.service",
        ),
        long_running(
            "loveward-postgres-backup-timer",
            "loveward-postgres-backup.timer",
        ),
        one_shot("pod-tracker-backup", "pod-tracker-backup.service"),
        long_running("pod-tracker-backup-timer", "pod-tracker-backup.timer"),
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
            systemd_units: &["fileferry-web.service"],
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
            public_target_id: "loveward-app",
            systemd_units: &[],
            compose_services: &["loveward"],
        },
        ServiceMapping {
            public_target_id: "status-dunamismax-com",
            systemd_units: &["status-dunamismax.service"],
            compose_services: &[],
        },
        ServiceMapping {
            public_target_id: "xrayservice-net",
            systemd_units: &["rustdesk-preconfig-build.service"],
            compose_services: &[],
        },
    ];

    MAPPINGS
}

pub fn caddy_probe_target() -> CaddyProbeTarget {
    CaddyProbeTarget {
        id: "caddy",
        config_path: "/etc/caddy/Caddyfile",
        unit: "caddy.service",
    }
}

pub fn cloudflare_ddns_target() -> CloudflareDdnsTarget {
    CloudflareDdnsTarget {
        id: "cloudflare-ddns",
        unit: "cloudflare-ddns.service",
    }
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

pub async fn probe_caddy_validate_reload(target: CaddyProbeTarget) -> HostCheckResult {
    let checked_at = Utc::now();
    let started = Instant::now();
    let validate_args = ["validate", "--config", target.config_path];

    match run_command("caddy", &validate_args).await {
        Ok(output) if output.status.success() => {
            let show_args = [
                "show",
                target.unit,
                "--property=ActiveState",
                "--property=Result",
                "--property=ActiveEnterTimestamp",
            ];
            match run_command("systemctl", &show_args).await {
                Ok(output) if output.status.success() => {
                    let facts = SystemdFacts::parse(&output.stdout);
                    evaluate_caddy_facts(target.id, checked_at, Some(started.elapsed()), facts)
                }
                Ok(output) => command_failed_result(
                    target.id,
                    HostCheckKind::Caddy,
                    checked_at,
                    Some(started.elapsed()),
                    CADDY_PROBE_VERSION,
                    "caddy reload evidence unavailable",
                    output.private_detail(),
                ),
                Err(error) => command_failed_result(
                    target.id,
                    HostCheckKind::Caddy,
                    checked_at,
                    Some(started.elapsed()),
                    CADDY_PROBE_VERSION,
                    "caddy reload evidence unavailable",
                    Some(error.to_string()),
                ),
            }
        }
        Ok(output) => HostCheckResult {
            target_id: target.id,
            check_kind: HostCheckKind::Caddy,
            state: StatusState::Down,
            checked_at,
            duration_ms: Some(duration_ms(started.elapsed())),
            reason: "caddy config is invalid".to_owned(),
            probe_version: CADDY_PROBE_VERSION,
            private_detail: output.private_detail(),
        },
        Err(error) => command_failed_result(
            target.id,
            HostCheckKind::Caddy,
            checked_at,
            Some(started.elapsed()),
            CADDY_PROBE_VERSION,
            "caddy validation unavailable",
            Some(error.to_string()),
        ),
    }
}

pub async fn probe_cloudflare_ddns_last_success(target: CloudflareDdnsTarget) -> HostCheckResult {
    let checked_at = Utc::now();
    let started = Instant::now();
    let args = [
        "show",
        target.unit,
        "--property=LoadState",
        "--property=ActiveState",
        "--property=Result",
        "--property=ExecMainStatus",
        "--property=InactiveEnterTimestamp",
    ];

    match run_command("systemctl", &args).await {
        Ok(output) if output.status.success() => {
            let facts = SystemdFacts::parse(&output.stdout);
            evaluate_cloudflare_ddns_facts(target.id, checked_at, Some(started.elapsed()), facts)
        }
        Ok(output) => command_failed_result(
            target.id,
            HostCheckKind::CloudflareDdns,
            checked_at,
            Some(started.elapsed()),
            CLOUDFLARE_DDNS_PROBE_VERSION,
            "Cloudflare DDNS status unavailable",
            output.private_detail(),
        ),
        Err(error) => command_failed_result(
            target.id,
            HostCheckKind::CloudflareDdns,
            checked_at,
            Some(started.elapsed()),
            CLOUDFLARE_DDNS_PROBE_VERSION,
            "Cloudflare DDNS status unavailable",
            Some(error.to_string()),
        ),
    }
}

pub async fn probe_root_disk_usage() -> HostCheckResult {
    let checked_at = Utc::now();
    let started = Instant::now();
    let args = ["--output=pcent,avail", "/"];

    match run_command("df", &args).await {
        Ok(output) if output.status.success() => {
            evaluate_root_disk_usage(checked_at, Some(started.elapsed()), &output.stdout)
        }
        Ok(output) => command_failed_result(
            "root-disk",
            HostCheckKind::Disk,
            checked_at,
            Some(started.elapsed()),
            DISK_PROBE_VERSION,
            "root filesystem usage unavailable",
            output.private_detail(),
        ),
        Err(error) => command_failed_result(
            "root-disk",
            HostCheckKind::Disk,
            checked_at,
            Some(started.elapsed()),
            DISK_PROBE_VERSION,
            "root filesystem usage unavailable",
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
            Ok(services) if compose_service_reported(target, &services) => {
                evaluate_compose_service(target, checked_at, Some(started.elapsed()), &services)
            }
            Ok(_) => probe_docker_compose_labels(target, checked_at, started)
                .await
                .unwrap_or_else(|| {
                    command_failed_result(
                        target.id,
                        HostCheckKind::DockerCompose,
                        checked_at,
                        Some(started.elapsed()),
                        DOCKER_COMPOSE_PROBE_VERSION,
                        "compose service was not reported",
                        None,
                    )
                }),
            Err(error) => probe_docker_compose_labels(target, checked_at, started)
                .await
                .unwrap_or_else(|| {
                    command_failed_result(
                        target.id,
                        HostCheckKind::DockerCompose,
                        checked_at,
                        Some(started.elapsed()),
                        DOCKER_COMPOSE_PROBE_VERSION,
                        "docker compose state unavailable",
                        Some(error.to_string()),
                    )
                }),
        },
        Ok(output) => probe_docker_compose_labels(target, checked_at, started)
            .await
            .unwrap_or_else(|| {
                command_failed_result(
                    target.id,
                    HostCheckKind::DockerCompose,
                    checked_at,
                    Some(started.elapsed()),
                    DOCKER_COMPOSE_PROBE_VERSION,
                    "docker compose state unavailable",
                    output.private_detail(),
                )
            }),
        Err(error) => probe_docker_compose_labels(target, checked_at, started)
            .await
            .unwrap_or_else(|| {
                command_failed_result(
                    target.id,
                    HostCheckKind::DockerCompose,
                    checked_at,
                    Some(started.elapsed()),
                    DOCKER_COMPOSE_PROBE_VERSION,
                    "docker compose state unavailable",
                    Some(error.to_string()),
                )
            }),
    }
}

async fn probe_docker_compose_labels(
    target: DockerComposeServiceTarget,
    checked_at: DateTime<Utc>,
    started: Instant,
) -> Option<HostCheckResult> {
    let project_label = format!("label=com.docker.compose.project={}", target.project);
    let service_label = format!("label=com.docker.compose.service={}", target.service);
    let args = [
        "ps",
        "--all",
        "--filter",
        project_label.as_str(),
        "--filter",
        service_label.as_str(),
        "--format",
        "json",
    ];

    let output = run_command("docker", &args).await.ok()?;
    if !output.status.success() {
        return None;
    }

    let containers = parse_docker_ps_json(&output.stdout).ok()?;
    let services = compose_facts_from_docker_ps(target, &containers);
    if compose_service_reported(target, &services) {
        Some(evaluate_compose_service(
            target,
            checked_at,
            Some(started.elapsed()),
            &services,
        ))
    } else {
        None
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

fn compose_service_reported(
    target: DockerComposeServiceTarget,
    services: &[DockerComposeFacts],
) -> bool {
    services
        .iter()
        .any(|service| service.service.as_deref() == Some(target.service))
}

fn evaluate_caddy_facts(
    target_id: &'static str,
    checked_at: DateTime<Utc>,
    duration: Option<Duration>,
    facts: SystemdFacts,
) -> HostCheckResult {
    let active_state = facts.value("ActiveState");
    let result = facts.value("Result").unwrap_or("success");
    let active_timestamp = facts.value("ActiveEnterTimestamp").unwrap_or_default();

    let (state, reason) = match (active_state, result, active_timestamp.is_empty()) {
        (Some("active"), "success", false) => (
            StatusState::Operational,
            "caddy config is valid and reload evidence is present",
        ),
        (Some("active"), "success", true) => (
            StatusState::Degraded,
            "caddy config is valid but reload recency is unavailable",
        ),
        (Some("failed"), _, _) => (StatusState::Down, "caddy service failed"),
        _ => (StatusState::Unknown, "caddy service state is unknown"),
    };

    HostCheckResult {
        target_id,
        check_kind: HostCheckKind::Caddy,
        state,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason: reason.to_owned(),
        probe_version: CADDY_PROBE_VERSION,
        private_detail: None,
    }
}

fn evaluate_cloudflare_ddns_facts(
    target_id: &'static str,
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
    let last_success = facts
        .value("InactiveEnterTimestamp")
        .filter(|value| !value.is_empty());

    let (state, reason) = if load_state != Some("loaded") {
        (StatusState::Unknown, "Cloudflare DDNS unit is not loaded")
    } else {
        match (active_state, result, exec_status, last_success) {
            (Some("active" | "activating"), _, _, _) => (
                StatusState::Operational,
                "Cloudflare DDNS update is running",
            ),
            (_, "success", 0, Some(_)) => (
                StatusState::Operational,
                "latest Cloudflare DDNS run succeeded",
            ),
            (_, "success", 0, None) => (
                StatusState::Degraded,
                "Cloudflare DDNS success time is unavailable",
            ),
            (Some("failed"), _, _, _)
            | (_, _, 1.., _)
            | (_, "exit-code" | "signal" | "timeout", _, _) => {
                (StatusState::Down, "latest Cloudflare DDNS run failed")
            }
            _ => (
                StatusState::Unknown,
                "latest Cloudflare DDNS result is unknown",
            ),
        }
    };

    HostCheckResult {
        target_id,
        check_kind: HostCheckKind::CloudflareDdns,
        state,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason: reason.to_owned(),
        probe_version: CLOUDFLARE_DDNS_PROBE_VERSION,
        private_detail: None,
    }
}

fn evaluate_root_disk_usage(
    checked_at: DateTime<Utc>,
    duration: Option<Duration>,
    output: &str,
) -> HostCheckResult {
    let facts = parse_df_usage(output);
    let (state, reason) = match facts {
        Some((usage, available)) if usage >= 90 => (
            StatusState::Down,
            format!("root filesystem is {usage}% full; {available} available"),
        ),
        Some((usage, available)) if usage >= 80 => (
            StatusState::Degraded,
            format!("root filesystem is {usage}% full; {available} available"),
        ),
        Some((usage, available)) => (
            StatusState::Operational,
            format!("root filesystem is {usage}% full; {available} available"),
        ),
        None => (
            StatusState::Unknown,
            "root filesystem usage could not be parsed".to_owned(),
        ),
    };

    HostCheckResult {
        target_id: "root-disk",
        check_kind: HostCheckKind::Disk,
        state,
        checked_at,
        duration_ms: duration.map(duration_ms),
        reason,
        probe_version: DISK_PROBE_VERSION,
        private_detail: None,
    }
}

fn parse_df_usage(output: &str) -> Option<(u8, String)> {
    let line = output.lines().nth(1)?;
    let mut fields = line.split_whitespace();
    let usage = fields.next()?.trim_end_matches('%').parse().ok()?;
    let available_kib = fields.next()?.parse::<u64>().ok()?;
    Some((usage, format_available_kib(available_kib)))
}

fn format_available_kib(kib: u64) -> String {
    const GIB: u64 = 1024 * 1024;
    const MIB: u64 = 1024;

    if kib >= GIB {
        format!("{}G", (kib + (GIB / 2)) / GIB)
    } else if kib >= MIB {
        format!("{}M", (kib + (MIB / 2)) / MIB)
    } else {
        format!("{kib}K")
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
    parse_json_records(input)
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
struct DockerPsFacts {
    #[serde(default, alias = "Names")]
    names: Option<String>,
    #[serde(default, alias = "State")]
    state: Option<String>,
    #[serde(default, alias = "Status")]
    status: Option<String>,
    #[serde(default, alias = "Labels")]
    labels: Option<String>,
}

fn parse_docker_ps_json(input: &str) -> Result<Vec<DockerPsFacts>, HostProbeError> {
    parse_json_records(input)
}

fn parse_json_records<T>(input: &str) -> Result<Vec<T>, HostProbeError>
where
    T: for<'de> Deserialize<'de>,
{
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

fn compose_facts_from_docker_ps(
    target: DockerComposeServiceTarget,
    containers: &[DockerPsFacts],
) -> Vec<DockerComposeFacts> {
    containers
        .iter()
        .filter(|container| docker_container_matches_compose_service(target, container))
        .map(|container| DockerComposeFacts {
            service: Some(target.service.to_owned()),
            state: container.state.as_deref().map(str::to_ascii_lowercase),
            health: container
                .status
                .as_deref()
                .and_then(health_from_docker_status),
        })
        .collect()
}

fn docker_container_matches_compose_service(
    target: DockerComposeServiceTarget,
    container: &DockerPsFacts,
) -> bool {
    let Some(labels) = container.labels.as_deref() else {
        return false;
    };

    label_value(labels, "com.docker.compose.project") == Some(target.project)
        && label_value(labels, "com.docker.compose.service") == Some(target.service)
}

fn label_value<'a>(labels: &'a str, key: &str) -> Option<&'a str> {
    labels.split(',').find_map(|label| {
        let (candidate, value) = label.split_once('=')?;
        (candidate == key).then_some(value)
    })
}

fn health_from_docker_status(status: &str) -> Option<String> {
    let status = status.to_ascii_lowercase();
    if status.contains("(healthy)") {
        Some("healthy".to_owned())
    } else if status.contains("(unhealthy)") {
        Some("unhealthy".to_owned())
    } else if status.contains("(health: starting)") || status.contains("(starting)") {
        Some("starting".to_owned())
    } else {
        None
    }
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
                project: "langindex",
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
                project: "langindex",
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
    fn docker_ps_label_fallback_marks_healthy_compose_service_operational() {
        let containers = parse_docker_ps_json(
            r#"{"Names":"loveward-app-1","Labels":"com.docker.compose.project=loveward,com.docker.compose.service=app","State":"running","Status":"Up 14 minutes (healthy)"}"#,
        )
        .expect("docker ps JSON lines");
        let target = DockerComposeServiceTarget {
            id: "loveward-container",
            project: "loveward",
            service: "app",
        };
        let services = compose_facts_from_docker_ps(target, &containers);

        let result = evaluate_compose_service(target, checked_at(), None, &services);

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "container is running");
    }

    #[test]
    fn docker_ps_label_fallback_keeps_unhealthy_compose_service_down() {
        let containers = parse_docker_ps_json(
            r#"{"Names":"loveward-app-1","Labels":"com.docker.compose.project=loveward,com.docker.compose.service=app","State":"running","Status":"Up 2 minutes (unhealthy)"}"#,
        )
        .expect("docker ps JSON lines");
        let target = DockerComposeServiceTarget {
            id: "loveward-container",
            project: "loveward",
            service: "app",
        };
        let services = compose_facts_from_docker_ps(target, &containers);

        let result = evaluate_compose_service(target, checked_at(), None, &services);

        assert_eq!(result.state, StatusState::Down);
        assert_eq!(result.reason, "container health is unhealthy");
    }

    #[test]
    fn disk_usage_under_threshold_is_operational() {
        let result = evaluate_root_disk_usage(
            checked_at(),
            Some(Duration::from_millis(3)),
            "Use% Avail\n 52% 59768800\n",
        );

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "root filesystem is 52% full; 57G available");
        assert_eq!(result.duration_ms, Some(3));
    }

    #[test]
    fn disk_usage_above_threshold_is_degraded() {
        let result = evaluate_root_disk_usage(checked_at(), None, "Use% Avail\n 86% 18874368\n");

        assert_eq!(result.state, StatusState::Degraded);
        assert_eq!(result.reason, "root filesystem is 86% full; 18G available");
    }

    #[test]
    fn caddy_valid_config_with_active_service_is_operational() {
        let facts = SystemdFacts::parse(
            r#"ActiveState=active
Result=success
ActiveEnterTimestamp=Mon 2026-05-18 12:00:00 UTC
"#,
        );

        let result = evaluate_caddy_facts("caddy", checked_at(), None, facts);

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(
            result.reason,
            "caddy config is valid and reload evidence is present"
        );
    }

    #[test]
    fn caddy_valid_config_without_reload_recency_is_degraded() {
        let facts = SystemdFacts::parse(
            r#"ActiveState=active
Result=success
ActiveEnterTimestamp=
"#,
        );

        let result = evaluate_caddy_facts("caddy", checked_at(), None, facts);

        assert_eq!(result.state, StatusState::Degraded);
        assert!(result.reason.contains("reload recency"));
    }

    #[test]
    fn cloudflare_ddns_success_with_timestamp_is_operational() {
        let facts = SystemdFacts::parse(
            r#"LoadState=loaded
ActiveState=inactive
Result=success
ExecMainStatus=0
InactiveEnterTimestamp=Mon 2026-05-18 12:00:00 UTC
"#,
        );

        let result = evaluate_cloudflare_ddns_facts("cloudflare-ddns", checked_at(), None, facts);

        assert_eq!(result.state, StatusState::Operational);
        assert_eq!(result.reason, "latest Cloudflare DDNS run succeeded");
    }

    #[test]
    fn cloudflare_ddns_failure_is_down() {
        let facts = SystemdFacts::parse(
            r#"LoadState=loaded
ActiveState=failed
Result=exit-code
ExecMainStatus=1
InactiveEnterTimestamp=Mon 2026-05-18 12:00:00 UTC
"#,
        );

        let result = evaluate_cloudflare_ddns_facts("cloudflare-ddns", checked_at(), None, facts);

        assert_eq!(result.state, StatusState::Down);
        assert_eq!(result.reason, "latest Cloudflare DDNS run failed");
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
            "loveward-app",
            "status-dunamismax-com",
            "xrayservice-net",
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
