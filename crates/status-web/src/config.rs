use std::{env, net::SocketAddr};

use thiserror::Error;

pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8095";
pub const DEFAULT_LOG_FILTER: &str = "info,status_web=info,tower_http=info";
pub const DEFAULT_RETENTION_DAYS: u32 = 30;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub log_filter: String,
    pub database_url: Option<String>,
    pub retention_days: u32,
    pub collect_once: bool,
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
        let retention_days = env::var("STATUS_RETENTION_DAYS")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.parse().map_err(ConfigError::RetentionDays))
            .transpose()?
            .unwrap_or(DEFAULT_RETENTION_DAYS);
        let collect_once = env_bool("STATUS_COLLECT_ONCE")?;

        Ok(Self {
            bind_addr,
            log_filter,
            database_url,
            retention_days,
            collect_once,
        })
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("STATUS_BIND_ADDR must be a valid socket address: {0}")]
    BindAddr(#[from] std::net::AddrParseError),
    #[error("STATUS_RETENTION_DAYS must be a positive integer: {0}")]
    RetentionDays(std::num::ParseIntError),
    #[error("{0} must be true, false, 1, 0, yes, or no")]
    Bool(&'static str),
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
}
