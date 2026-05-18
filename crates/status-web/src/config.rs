use std::{env, net::SocketAddr};

use chrono::{DateTime, Utc};
use thiserror::Error;

use crate::{alert::AlertConfig, model::DeploymentEvent};

pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8095";
pub const DEFAULT_LOG_FILTER: &str = "info,status_web=info,tower_http=info";
pub const DEFAULT_RETENTION_DAYS: u32 = 30;
pub const DEFAULT_DEPLOYMENT_ENVIRONMENT: &str = "production";
pub const DEFAULT_ALERT_REPEAT_AFTER_MINUTES: u32 = 60;
pub const DEFAULT_ALERT_MAX_NOTIFICATIONS_PER_RUN: u32 = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub log_filter: String,
    pub database_url: Option<String>,
    pub retention_days: u32,
    pub collect_once: bool,
    pub operator_token: Option<String>,
    pub deployment_event: Option<DeploymentEvent>,
    pub alert: AlertConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = env::var("STATUS_BIND_ADDR")
            .unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_owned())
            .parse()
            .map_err(ConfigError::BindAddr)?;
        let log_filter = env::var("STATUS_LOG").unwrap_or_else(|_| DEFAULT_LOG_FILTER.to_owned());
        let database_url = env::var("STATUS_DATABASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty());
        let retention_days = env_u32("STATUS_RETENTION_DAYS", ConfigError::RetentionDays)?
            .unwrap_or(DEFAULT_RETENTION_DAYS);
        let collect_once = env_bool("STATUS_COLLECT_ONCE")?;
        let operator_token = env_string("STATUS_OPERATOR_TOKEN");
        let deployment_event = if env_bool("STATUS_RECORD_DEPLOYMENT")? {
            Some(deployment_event_from_env()?)
        } else {
            None
        };
        let alert = AlertConfig {
            webhook_url: env_string("STATUS_ALERT_WEBHOOK_URL"),
            repeat_after_minutes: env_u32(
                "STATUS_ALERT_REPEAT_AFTER_MINUTES",
                ConfigError::AlertRepeatAfterMinutes,
            )?
            .unwrap_or(DEFAULT_ALERT_REPEAT_AFTER_MINUTES),
            max_notifications_per_run: env_u32(
                "STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN",
                ConfigError::AlertMaxNotificationsPerRun,
            )?
            .unwrap_or(DEFAULT_ALERT_MAX_NOTIFICATIONS_PER_RUN),
        };

        Ok(Self {
            bind_addr,
            log_filter,
            database_url,
            retention_days,
            collect_once,
            operator_token,
            deployment_event,
            alert,
        })
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("STATUS_BIND_ADDR must be a valid socket address: {0}")]
    BindAddr(#[from] std::net::AddrParseError),
    #[error("STATUS_RETENTION_DAYS must be a positive integer: {0}")]
    RetentionDays(std::num::ParseIntError),
    #[error("STATUS_ALERT_REPEAT_AFTER_MINUTES must be a positive integer: {0}")]
    AlertRepeatAfterMinutes(std::num::ParseIntError),
    #[error("STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN must be a positive integer: {0}")]
    AlertMaxNotificationsPerRun(std::num::ParseIntError),
    #[error("STATUS_DEPLOYMENT_DEPLOYED_AT must be an RFC3339 timestamp: {0}")]
    DeploymentTime(chrono::ParseError),
    #[error("{0} must be true, false, 1, 0, yes, or no")]
    Bool(&'static str),
}

fn deployment_event_from_env() -> Result<DeploymentEvent, ConfigError> {
    let service_id = env_string("STATUS_DEPLOYMENT_SERVICE_ID");
    let repo_name = env_string("STATUS_DEPLOYMENT_REPO_NAME");
    let commit_sha = env_string("STATUS_DEPLOYMENT_COMMIT_SHA");
    let environment = env_string("STATUS_DEPLOYMENT_ENVIRONMENT")
        .unwrap_or_else(|| DEFAULT_DEPLOYMENT_ENVIRONMENT.to_owned());
    let deployed_at = match env_string("STATUS_DEPLOYMENT_DEPLOYED_AT") {
        Some(value) => DateTime::parse_from_rfc3339(&value)
            .map_err(ConfigError::DeploymentTime)?
            .with_timezone(&Utc),
        None => Utc::now(),
    };
    let public_summary = env_string("STATUS_DEPLOYMENT_PUBLIC_SUMMARY").unwrap_or_else(|| {
        let subject = service_id
            .as_deref()
            .or(repo_name.as_deref())
            .unwrap_or("service");
        format!("{subject} deployed to {environment}")
    });

    Ok(DeploymentEvent {
        service_id,
        repo_name,
        commit_sha,
        environment,
        deployed_at,
        public_summary,
    })
}

fn env_string(name: &'static str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn env_u32(
    name: &'static str,
    error: fn(std::num::ParseIntError) -> ConfigError,
) -> Result<Option<u32>, ConfigError> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.parse().map_err(error))
        .transpose()
}

fn env_bool(name: &'static str) -> Result<bool, ConfigError> {
    match env::var(name).ok().as_deref() {
        None | Some("") | Some("0") | Some("false") | Some("False") | Some("no") | Some("No") => {
            Ok(false)
        }
        Some("1") | Some("true") | Some("True") | Some("yes") | Some("Yes") => Ok(true),
        Some(_) => Err(ConfigError::Bool(name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bind_addr_is_localhost_8095() {
        let addr: SocketAddr = DEFAULT_BIND_ADDR.parse().expect("default address");
        assert_eq!(addr.ip().to_string(), "127.0.0.1");
        assert_eq!(addr.port(), 8095);
    }

    #[test]
    fn default_retention_is_thirty_days() {
        assert_eq!(DEFAULT_RETENTION_DAYS, 30);
    }

    #[test]
    fn default_alert_policy_has_suppression_and_rate_limit() {
        assert_eq!(DEFAULT_ALERT_REPEAT_AFTER_MINUTES, 60);
        assert_eq!(DEFAULT_ALERT_MAX_NOTIFICATIONS_PER_RUN, 5);
    }

    #[test]
    fn parses_deployment_event_env_values() {
        unsafe {
            env::set_var("STATUS_RECORD_DEPLOYMENT", "true");
            env::set_var("STATUS_DEPLOYMENT_SERVICE_ID", "status-dunamismax");
            env::set_var("STATUS_DEPLOYMENT_REPO_NAME", "status.dunamismax");
            env::set_var("STATUS_DEPLOYMENT_COMMIT_SHA", "abcdef1234567890");
            env::set_var("STATUS_DEPLOYMENT_ENVIRONMENT", "production");
            env::set_var("STATUS_DEPLOYMENT_DEPLOYED_AT", "2026-05-18T12:00:00Z");
            env::set_var("STATUS_DEPLOYMENT_PUBLIC_SUMMARY", "status deployed");
        }

        let config = Config::from_env().expect("config");
        let deployment = config.deployment_event.expect("deployment event");

        assert_eq!(deployment.service_id.as_deref(), Some("status-dunamismax"));
        assert_eq!(deployment.repo_name.as_deref(), Some("status.dunamismax"));
        assert_eq!(deployment.environment, "production");
        assert_eq!(deployment.public_summary, "status deployed");

        unsafe {
            env::remove_var("STATUS_RECORD_DEPLOYMENT");
            env::remove_var("STATUS_DEPLOYMENT_SERVICE_ID");
            env::remove_var("STATUS_DEPLOYMENT_REPO_NAME");
            env::remove_var("STATUS_DEPLOYMENT_COMMIT_SHA");
            env::remove_var("STATUS_DEPLOYMENT_ENVIRONMENT");
            env::remove_var("STATUS_DEPLOYMENT_DEPLOYED_AT");
            env::remove_var("STATUS_DEPLOYMENT_PUBLIC_SUMMARY");
        }
    }

    #[test]
    fn parses_bool_env_values() {
        unsafe {
            env::set_var("STATUS_COLLECT_ONCE", "yes");
        }
        assert!(env_bool("STATUS_COLLECT_ONCE").expect("bool"));

        unsafe {
            env::set_var("STATUS_COLLECT_ONCE", "0");
        }
        assert!(!env_bool("STATUS_COLLECT_ONCE").expect("bool"));

        unsafe {
            env::remove_var("STATUS_COLLECT_ONCE");
        }
    }

    #[test]
    fn parses_alert_env_values() {
        unsafe {
            env::set_var(
                "STATUS_ALERT_WEBHOOK_URL",
                "https://example.com/status-alerts",
            );
            env::set_var("STATUS_ALERT_REPEAT_AFTER_MINUTES", "120");
            env::set_var("STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN", "3");
        }

        let config = Config::from_env().expect("config");

        assert_eq!(
            config.alert.webhook_url.as_deref(),
            Some("https://example.com/status-alerts")
        );
        assert_eq!(config.alert.repeat_after_minutes, 120);
        assert_eq!(config.alert.max_notifications_per_run, 3);

        unsafe {
            env::remove_var("STATUS_ALERT_WEBHOOK_URL");
            env::remove_var("STATUS_ALERT_REPEAT_AFTER_MINUTES");
            env::remove_var("STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN");
        }
    }
}
