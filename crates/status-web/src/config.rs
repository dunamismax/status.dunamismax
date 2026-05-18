use std::{env, net::SocketAddr};

use thiserror::Error;

pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:8095";
pub const DEFAULT_LOG_FILTER: &str = "info,status_web=info,tower_http=info";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub log_filter: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_addr = env::var("STATUS_BIND_ADDR")
            .unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_owned())
            .parse()
            .map_err(ConfigError::BindAddr)?;
        let log_filter = env::var("STATUS_LOG").unwrap_or_else(|_| DEFAULT_LOG_FILTER.to_owned());

        Ok(Self {
            bind_addr,
            log_filter,
        })
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("STATUS_BIND_ADDR must be a valid socket address: {0}")]
    BindAddr(#[from] std::net::AddrParseError),
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
}
