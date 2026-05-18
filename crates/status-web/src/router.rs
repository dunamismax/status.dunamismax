use axum::{Json, Router, extract::State, response::IntoResponse, routing::get};
use serde::Serialize;
use tower_http::{compression::CompressionLayer, trace::TraceLayer};

use crate::{
    assets,
    model::{IncidentRecord, MaintenanceWindow, ProjectStatus, StatusSnapshot},
    pages,
    probes::ProbeRunner,
    project,
    store::StatusStore,
};

#[derive(Debug, Clone)]
pub struct AppState {
    source: StatusSource,
    store: Option<StatusStore>,
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
            store: None,
        }
    }

    pub fn live_with_store(store: Option<StatusStore>) -> Self {
        Self {
            source: StatusSource::Live(ProbeRunner::new()),
            store,
        }
    }

    pub fn fixed(snapshot: StatusSnapshot) -> Self {
        Self {
            source: StatusSource::Fixed(snapshot),
            store: None,
        }
    }

    async fn monitored_snapshot(&self) -> StatusSnapshot {
        match &self.source {
            StatusSource::Live(runner) => runner.collect_monitored_status().await,
            StatusSource::Fixed(snapshot) => snapshot.clone(),
        }
    }

    async fn status_snapshot(&self) -> StatusSnapshot {
        match &self.source {
            StatusSource::Live(runner) => {
                let services = runner.collect_monitored_services().await;
                let projects = project::collect_project_status().await;
                StatusSnapshot::from_services_and_projects(services, projects)
            }
            StatusSource::Fixed(snapshot) => snapshot.clone(),
        }
    }

    async fn projects(&self) -> Vec<ProjectStatus> {
        match &self.source {
            StatusSource::Live(_) => project::collect_project_status().await,
            StatusSource::Fixed(snapshot) => snapshot.projects.clone(),
        }
    }

    async fn incidents(
        &self,
    ) -> (
        Vec<crate::model::IncidentRecord>,
        Vec<crate::model::MaintenanceWindow>,
    ) {
        let Some(store) = &self.store else {
            return (Vec::new(), Vec::new());
        };

        let incidents = match store.recent_incidents().await {
            Ok(incidents) => incidents,
            Err(error) => {
                tracing::warn!(%error, "incident history query failed");
                Vec::new()
            }
        };
        let maintenance = match store.maintenance_windows().await {
            Ok(maintenance) => maintenance,
            Err(error) => {
                tracing::warn!(%error, "maintenance history query failed");
                Vec::new()
            }
        };

        (incidents, maintenance)
    }

    async fn deployments(&self) -> Vec<crate::model::DeploymentEvent> {
        let Some(store) = &self.store else {
            return Vec::new();
        };

        match store.recent_deployments().await {
            Ok(deployments) => deployments,
            Err(error) => {
                tracing::warn!(%error, "deployment history query failed");
                Vec::new()
            }
        }
    }

    async fn readiness(&self) -> ReadyResponse {
        match &self.store {
            Some(store) => match store.ready().await {
                Ok(()) => ReadyResponse {
                    status: "ready",
                    dependencies: "postgresql-ready,public-http-probes-configured",
                    database: "ready",
                },
                Err(error) => {
                    tracing::warn!(%error, "database readiness check failed");
                    ReadyResponse {
                        status: "degraded",
                        dependencies: "postgresql-unavailable,public-http-probes-configured",
                        database: "unavailable",
                    }
                }
            },
            None => ReadyResponse {
                status: "ready",
                dependencies: "postgresql-not-configured,public-http-probes-configured",
                database: "not_configured",
            },
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
        .route("/api/incidents.json", get(incidents_json))
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
    pages::overview(&state.monitored_snapshot().await)
}

async fn services(State(state): State<AppState>) -> impl IntoResponse {
    pages::services(&state.monitored_snapshot().await)
}

async fn projects(State(state): State<AppState>) -> impl IntoResponse {
    pages::projects(&state.projects().await)
}

async fn incidents(State(state): State<AppState>) -> impl IntoResponse {
    let (incidents, maintenance) = state.incidents().await;
    pages::incidents(&incidents, &maintenance)
}

async fn deployments(State(state): State<AppState>) -> impl IntoResponse {
    pages::deployments(&state.deployments().await)
}

async fn healthz() -> &'static str {
    "ok\n"
}

async fn readyz(State(state): State<AppState>) -> Json<ReadyResponse> {
    Json(state.readiness().await)
}

async fn status_json(State(state): State<AppState>) -> Json<StatusSnapshot> {
    Json(state.status_snapshot().await)
}

async fn incidents_json(State(state): State<AppState>) -> Json<IncidentFeed> {
    let (incidents, maintenance) = state.incidents().await;
    Json(IncidentFeed {
        incidents,
        maintenance,
    })
}

async fn not_found() -> impl IntoResponse {
    pages::not_found()
}

#[derive(Debug, Serialize)]
struct ReadyResponse {
    status: &'static str,
    dependencies: &'static str,
    database: &'static str,
}

#[derive(Debug, Serialize)]
struct IncidentFeed {
    incidents: Vec<IncidentRecord>,
    maintenance: Vec<MaintenanceWindow>,
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
        BuildProgress, CheckKind, CheckResult, GitStatus, MonitorTarget, ProjectStatus,
        ProjectTarget, ServiceStatus, StatusSnapshot, StatusState,
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
        assert!(body.contains("postgresql-not-configured"));
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
        assert!(body.contains("Some monitored services are degraded"));
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
        assert_eq!(json["projects"][0]["target"]["repo_name"], "sealport");
        assert!(json["projects"][0]["target"]["repo_path"].is_null());
    }

    #[tokio::test]
    async fn incidents_json_returns_public_feed_shape() {
        let (status, body, headers) = get("/api/incidents.json").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            headers.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        let json: serde_json::Value = serde_json::from_str(&body).expect("json");
        assert!(json["incidents"].as_array().expect("incidents").is_empty());
        assert!(
            json["maintenance"]
                .as_array()
                .expect("maintenance")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn projects_route_renders_project_cards() {
        let (status, body, _) = get("/projects").await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Repository status"));
        assert!(body.contains("fileferry"));
        assert!(body.contains("BUILD progress"));
        assert!(!body.contains("/home/sawyer"));
    }

    #[tokio::test]
    async fn incidents_route_renders_empty_history() {
        let (status, body, _) = get("/incidents").await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Incidents"));
        assert!(body.contains("No incident records are stored yet."));
    }

    #[tokio::test]
    async fn deployments_route_renders_empty_history() {
        let (status, body, _) = get("/deployments").await;

        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Deployments"));
        assert!(body.contains("No deployment records are stored yet."));
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
                        state: StatusState::Degraded,
                        checked_at,
                        latency_ms: Some(88),
                        reason: "expected HTTP 200, got HTTP 503".to_owned(),
                        probe_version: "test",
                    },
                },
            ],
            vec![ProjectStatus {
                target: ProjectTarget {
                    id: "fileferry",
                    name: "fileferry",
                    repo_name: "sealport",
                    public_url: Some("https://fileferry.app"),
                    repo_path: "/home/sawyer/github/sealport".to_owned(),
                },
                state: StatusState::Operational,
                checked_at,
                reason: "repository is current; BUILD progress 2/3".to_owned(),
                git: GitStatus {
                    branch: Some("main".to_owned()),
                    upstream: Some("origin/main".to_owned()),
                    ahead: Some(0),
                    behind: Some(0),
                    dirty: Some(false),
                    latest_commit_age_days: Some(1),
                    remote_reachable: Some(true),
                },
                build: Some(BuildProgress {
                    checked: 2,
                    total: 3,
                    next_phase: Some("Phase 4: Repository And Project Status".to_owned()),
                }),
                probe_version: "test",
            }],
        )
    }
}
