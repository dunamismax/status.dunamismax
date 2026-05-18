use axum::{Json, Router, extract::State, response::IntoResponse, routing::get};
use serde::Serialize;
use tower_http::{compression::CompressionLayer, trace::TraceLayer};

use crate::{
    assets,
    model::StatusSnapshot,
    pages::{self, NavSection},
    probes::ProbeRunner,
};

#[derive(Debug, Clone)]
pub struct AppState {
    source: StatusSource,
}

#[derive(Debug, Clone)]
enum StatusSource {
    Live(ProbeRunner),
    Fixed(StatusSnapshot),
}

impl AppState {
    pub fn live() -> Self {
        Self {
            source: StatusSource::Live(ProbeRunner::new()),
        }
    }

    pub fn fixed(snapshot: StatusSnapshot) -> Self {
        Self {
            source: StatusSource::Fixed(snapshot),
        }
    }

    async fn snapshot(&self) -> StatusSnapshot {
        match &self.source {
            StatusSource::Live(runner) => runner.collect_public_status().await,
            StatusSource::Fixed(snapshot) => snapshot.clone(),
        }
    }
}

pub fn router() -> Router {
    router_with_state(AppState::live())
}

pub fn router_with_snapshot(snapshot: StatusSnapshot) -> Router {
    router_with_state(AppState::fixed(snapshot))
}

pub fn router_with_state(state: AppState) -> Router {
    Router::new()
        .route("/", get(home))
        .route("/services", get(services))
        .route("/projects", get(projects))
        .route("/incidents", get(incidents))
        .route("/deployments", get(deployments))
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/api/status.json", get(status_json))
        .route("/assets/status.css", get(assets::style_css))
        .route("/icon.svg", get(assets::icon_svg))
        .route("/robots.txt", get(assets::robots_txt))
        .fallback(not_found)
        .with_state(state)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
}

async fn home(State(state): State<AppState>) -> impl IntoResponse {
    pages::overview(&state.snapshot().await)
}

async fn services(State(state): State<AppState>) -> impl IntoResponse {
    pages::services(&state.snapshot().await)
}

async fn projects() -> impl IntoResponse {
    pages::placeholder(NavSection::Projects)
}

async fn incidents() -> impl IntoResponse {
    pages::placeholder(NavSection::Incidents)
}

async fn deployments() -> impl IntoResponse {
    pages::placeholder(NavSection::Deployments)
}

async fn healthz() -> &'static str {
    "ok\n"
}

async fn readyz() -> Json<ReadyResponse> {
    Json(ReadyResponse {
        status: "ready",
        dependencies: "public-http-probes-configured",
    })
}

async fn status_json(State(state): State<AppState>) -> Json<StatusSnapshot> {
    Json(state.snapshot().await)
}

async fn not_found() -> impl IntoResponse {
    pages::not_found()
}

#[derive(Debug, Serialize)]
struct ReadyResponse {
    status: &'static str,
    dependencies: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, StatusCode, header},
    };
    use chrono::TimeZone;
    use tower::ServiceExt;

    use crate::model::{
        CheckKind, CheckResult, MonitorTarget, ServiceStatus, StatusSnapshot, StatusState,
    };

    async fn get(path: &str) -> (StatusCode, String, axum::http::HeaderMap) {
        let response = router_with_snapshot(snapshot_fixture())
            .oneshot(
                Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("route response");
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body bytes");

        (
            status,
            String::from_utf8_lossy(&bytes).into_owned(),
            headers,
        )
    }

    #[tokio::test]
    async fn healthz_returns_ok() {
        let (status, body, _) = get("/healthz").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "ok\n");
    }

    #[tokio::test]
    async fn readyz_returns_dependency_shape() {
        let (status, body, _) = get("/readyz").await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("ready"));
        assert!(body.contains("public-http-probes-configured"));
    }

    #[tokio::test]
    async fn home_route_renders_status_surface() {
        let (status, body, headers) = get("/").await;

        assert_eq!(status, StatusCode::OK);
        assert!(
            headers
                .get(header::CONTENT_TYPE)
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with("text/html")
        );
        assert!(body.contains("Dunamis Status"));
        assert!(body.contains("Some monitored public services are degraded"));
        assert!(body.contains("fileferry.app"));
    }

    #[tokio::test]
    async fn services_route_renders_check_table() {
        let (status, body, _) = get("/services").await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Service-level status"));
        assert!(body.contains("expected HTTP 200, got HTTP 503"));
        assert!(body.contains("42 ms"));
    }

    #[tokio::test]
    async fn status_json_returns_snapshot() {
        let (status, body, headers) = get("/api/status.json").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            headers.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        let json: serde_json::Value = serde_json::from_str(&body).expect("json");
        assert_eq!(json["overall_state"], "degraded");
        assert_eq!(json["summary"]["operational"], 1);
        assert_eq!(json["summary"]["degraded"], 1);
    }

    #[tokio::test]
    async fn assets_are_embedded() {
        for (path, content_type, expected) in [
            ("/assets/status.css", "text/css", ".status-table"),
            ("/icon.svg", "image/svg+xml", "<svg"),
            ("/robots.txt", "text/plain", "User-agent"),
        ] {
            let (status, body, headers) = get(path).await;

            assert_eq!(status, StatusCode::OK, "{path}");
            assert!(
                headers
                    .get(header::CONTENT_TYPE)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .starts_with(content_type),
                "{path}"
            );
            assert!(body.contains(expected), "{path}");
        }
    }

    fn snapshot_fixture() -> StatusSnapshot {
        let checked_at = chrono::Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        StatusSnapshot::from_services(vec![
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
                    state: StatusState::Degraded,
                    checked_at,
                    latency_ms: Some(88),
                    reason: "expected HTTP 200, got HTTP 503".to_owned(),
                    probe_version: "test",
                },
            },
        ])
    }
}
