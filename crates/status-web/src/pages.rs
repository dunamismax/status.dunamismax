use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use leptos::prelude::*;
use leptos::tachys::view::RenderHtml;

use crate::model::{
    DeploymentEvent, IncidentRecord, MaintenanceWindow, ProjectStatus, ServiceStatus,
    StatusSnapshot, StatusState,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavSection {
    Overview,
    Services,
    Projects,
    Incidents,
    Deployments,
    Operator,
}

pub fn overview(snapshot: &StatusSnapshot) -> Response {
    let affected = snapshot.summary.degraded + snapshot.summary.down + snapshot.summary.unknown;
    let body = format!(
        r#"
<section class="status-band">
  <div>
    <p class="eyebrow">Self-hosted ecosystem status</p>
    <h1>{}</h1>
    <p class="lede">{} of {} monitored checks need attention. Last checked {}.</p>
  </div>
  {}
</section>
<section class="section">
  <div class="section-heading">
    <h2>Monitored checks</h2>
    <a href="/services">Service details</a>
  </div>
  {}
</section>
"#,
        state_headline(snapshot.overall_state),
        affected,
        snapshot.services.len(),
        format_time(snapshot.checked_at),
        summary_html(snapshot),
        service_table_html(&snapshot.services),
    );

    render_page(
        "Dunamis Status",
        "Current public status for the dunamismax self-hosted ecosystem.",
        NavSection::Overview,
        body,
    )
}

pub fn services(snapshot: &StatusSnapshot) -> Response {
    let body = format!(
        r#"
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Service-level status</p>
      <h1>Monitored services</h1>
    </div>
    <p class="timestamp">Last checked {}</p>
  </div>
  {}
</section>
"#,
        format_time(snapshot.checked_at),
        service_table_html(&snapshot.services),
    );

    render_page(
        "Services",
        "Public service check results for the dunamismax ecosystem.",
        NavSection::Services,
        body,
    )
}

pub fn projects(projects: &[ProjectStatus]) -> Response {
    let body = format!(
        r#"
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Repository status</p>
      <h1>Projects</h1>
    </div>
    <p class="timestamp">{} monitored repositories</p>
  </div>
  {}
</section>
"#,
        projects.len(),
        project_grid_html(projects),
    );

    render_page(
        "Projects",
        "Repository and project health for the dunamismax ecosystem.",
        NavSection::Projects,
        body,
    )
}

pub fn incidents(incidents: &[IncidentRecord], maintenance: &[MaintenanceWindow]) -> Response {
    let body = format!(
        r#"
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Operational context</p>
      <h1>Incidents</h1>
    </div>
    <p class="timestamp">{} incident records</p>
  </div>
  {}
</section>
<section class="section">
  <div class="section-heading">
    <h2>Maintenance</h2>
    <p class="timestamp">{} recent or upcoming windows</p>
  </div>
  {}
</section>
"#,
        incidents.len(),
        incident_table_html(incidents),
        maintenance.len(),
        maintenance_table_html(maintenance),
    );

    render_page(
        "Incidents",
        "Incident and maintenance history for the dunamismax ecosystem.",
        NavSection::Incidents,
        body,
    )
}

pub fn deployments(deployments: &[DeploymentEvent]) -> Response {
    let body = format!(
        r#"
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Release evidence</p>
      <h1>Deployments</h1>
    </div>
    <p class="timestamp">{} deployment records</p>
  </div>
  {}
</section>
"#,
        deployments.len(),
        deployment_table_html(deployments),
    );

    render_page(
        "Deployments",
        "Recent deployment evidence for the dunamismax ecosystem.",
        NavSection::Deployments,
        body,
    )
}

pub fn operator(snapshot: &StatusSnapshot, readiness: &str, database: &str) -> Response {
    let body = format!(
        r#"
<section class="section first-section">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Operator</p>
      <h1>Private status detail</h1>
    </div>
    <p class="timestamp">Last checked {}</p>
  </div>
  <dl class="summary" aria-label="Operator summary">
    <div><dt>Overall</dt><dd>{}</dd></div>
    <div><dt>Readiness</dt><dd>{}</dd></div>
    <div><dt>Database</dt><dd>{}</dd></div>
    <div><dt>Projects</dt><dd>{}</dd></div>
  </dl>
</section>
<section class="section">
  <div class="section-heading">
    <h2>Service checks</h2>
    <p class="timestamp">{} checks</p>
  </div>
  {}
</section>
<section class="section">
  <div class="section-heading">
    <h2>Repository paths</h2>
    <p class="timestamp">authenticated view</p>
  </div>
  {}
</section>
"#,
        format_time(snapshot.checked_at),
        snapshot.overall_state.as_str(),
        escape_html(readiness),
        escape_html(database),
        snapshot.projects.len(),
        snapshot.services.len(),
        service_table_html(&snapshot.services),
        operator_project_table_html(&snapshot.projects),
    );

    render_page(
        "Operator",
        "Private operator status for the dunamismax ecosystem.",
        NavSection::Operator,
        body,
    )
}

pub fn placeholder(section: NavSection) -> Response {
    let (title, heading, text) = match section {
        NavSection::Projects => (
            "Projects",
            "Project status",
            "Repository and project health will appear after the git probe phase.",
        ),
        NavSection::Incidents => (
            "Incidents",
            "Incidents",
            "Incident and maintenance history will appear after the history phase.",
        ),
        NavSection::Deployments => (
            "Deployments",
            "Deployments",
            "Deployment evidence will appear after persistence and deploy integration land.",
        ),
        _ => (
            "Status",
            "Status",
            "This status section is not implemented yet.",
        ),
    };
    let body = format!(
        r#"<section class="section first-section"><p class="eyebrow">Planned</p><h1>{}</h1><p class="lede">{}</p></section>"#,
        escape_html(heading),
        escape_html(text),
    );

    render_page(title, text, section, body)
}

fn operator_project_table_html(projects: &[ProjectStatus]) -> String {
    if projects.is_empty() {
        return empty_state("No project records are available.");
    }

    let rows = projects
        .iter()
        .map(|project| {
            let branch = project.git.branch.as_deref().unwrap_or("unknown");
            let upstream = project.git.upstream.as_deref().unwrap_or("none");
            let dirty = match project.git.dirty {
                Some(true) => "dirty",
                Some(false) => "clean",
                None => "unknown",
            };
            format!(
                r#"<tr>
  <th scope="row">{}</th>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
                escape_html(project.target.name),
                escape_html(project.target.repo_name),
                escape_html(&project.target.repo_path),
                escape_html(branch),
                escape_html(upstream),
                dirty,
            )
        })
        .collect::<Vec<_>>()
        .join("");

    table_html(
        &["Project", "Repo", "Path", "Branch", "Upstream", "Worktree"],
        rows,
    )
}

pub fn not_found() -> Response {
    let body = r#"<section class="section first-section"><h1>Not found</h1><p class="lede">That status page is not available.</p></section>"#.to_owned();
    render_with_status(
        StatusCode::NOT_FOUND,
        "Not found",
        "The requested status page was not found.",
        NavSection::Overview,
        body,
    )
}

fn render_page(
    title: &'static str,
    description: &'static str,
    section: NavSection,
    body: String,
) -> Response {
    render_with_status(StatusCode::OK, title, description, section, body)
}

fn render_with_status(
    status: StatusCode,
    title: &'static str,
    description: &'static str,
    section: NavSection,
    body: String,
) -> Response {
    let full_title = if section == NavSection::Overview {
        "Dunamis Status".to_owned()
    } else {
        format!("{title} · Dunamis Status")
    };
    let html = view! {
        <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="color-scheme" content="light dark" />
                <meta name="description" content=description />
                <link rel="icon" type="image/svg+xml" href="/icon.svg" />
                <link rel="stylesheet" href="/assets/status.css" />
                <title>{full_title}</title>
            </head>
            <body>
                <a class="skip" href="#main">"Skip to status"</a>
                <header class="site-header">
                    <a class="brand" href="/" aria-label="Dunamis Status home">
                        <span class="brand-mark" aria-hidden="true">"DS"</span>
                        <span>"Dunamis Status"</span>
                    </a>
                    <nav aria-label="Primary">
                        <NavLink href="/" active=section == NavSection::Overview>"Overview"</NavLink>
                        <NavLink href="/services" active=section == NavSection::Services>"Services"</NavLink>
                        <NavLink href="/projects" active=section == NavSection::Projects>"Projects"</NavLink>
                        <NavLink href="/incidents" active=section == NavSection::Incidents>"Incidents"</NavLink>
                        <NavLink href="/deployments" active=section == NavSection::Deployments>"Deployments"</NavLink>
                    </nav>
                </header>
                <main id="main" inner_html=body></main>
                <footer class="site-footer">
                    <span>"status.dunamismax.com"</span>
                    <a href="/api/status.json">"JSON"</a>
                </footer>
            </body>
        </html>
    };
    let document = format!("<!DOCTYPE html>{}", html.to_html());

    (
        status,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        document,
    )
        .into_response()
}

#[component]
fn NavLink(href: &'static str, active: bool, children: Children) -> impl IntoView {
    let class = if active {
        "nav-link active"
    } else {
        "nav-link"
    };
    view! { <a class=class href=href>{children()}</a> }
}

fn summary_html(snapshot: &StatusSnapshot) -> String {
    format!(
        r#"<dl class="summary" aria-label="Status summary">
  <div><dt>Operational</dt><dd>{}</dd></div>
  <div><dt>Degraded</dt><dd>{}</dd></div>
  <div><dt>Down</dt><dd>{}</dd></div>
  <div><dt>Unknown</dt><dd>{}</dd></div>
</dl>"#,
        snapshot.summary.operational,
        snapshot.summary.degraded,
        snapshot.summary.down,
        snapshot.summary.unknown,
    )
}

fn service_table_html(services: &[ServiceStatus]) -> String {
    let rows = services
        .iter()
        .map(service_row_html)
        .collect::<Vec<_>>()
        .join("");

    format!(
        r#"<div class="table-wrap">
  <table class="status-table">
    <thead>
      <tr>
        <th scope="col">Service</th>
        <th scope="col">State</th>
        <th scope="col">Latency</th>
        <th scope="col">Last checked</th>
        <th scope="col">Reason</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
</div>"#
    )
}

fn service_row_html(service: &ServiceStatus) -> String {
    let state = service.check.state.as_str();
    let latency = service
        .check
        .latency_ms
        .map(|latency| format!("{latency} ms"))
        .unwrap_or_else(|| "n/a".to_owned());
    let service_name = if service.target.public_url.is_empty() {
        escape_html(service.target.name)
    } else {
        format!(
            r#"<a href="{}">{}</a>"#,
            escape_html(service.target.public_url),
            escape_html(service.target.name)
        )
    };

    format!(
        r#"<tr>
  <th scope="row">{}<span>{}</span></th>
  <td><span class="state state-{}">{}</span></td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
        service_name,
        escape_html(service.target.group),
        state,
        state,
        escape_html(&latency),
        format_time(service.check.checked_at),
        escape_html(&service.check.reason),
    )
}

fn project_grid_html(projects: &[ProjectStatus]) -> String {
    let cards = projects
        .iter()
        .map(project_card_html)
        .collect::<Vec<_>>()
        .join("");

    format!(r#"<div class="project-grid">{cards}</div>"#)
}

fn project_card_html(project: &ProjectStatus) -> String {
    let state = project.state.as_str();
    let branch = project.git.branch.as_deref().unwrap_or("unknown");
    let upstream = project.git.upstream.as_deref().unwrap_or("none");
    let dirty = match project.git.dirty {
        Some(true) => "dirty",
        Some(false) => "clean",
        None => "unknown",
    };
    let remote = match project.git.remote_reachable {
        Some(true) => "reachable",
        Some(false) => "unreachable",
        None => "unknown",
    };
    let commit_age = project
        .git
        .latest_commit_age_days
        .map(|age| format!("{age} days"))
        .unwrap_or_else(|| "unknown".to_owned());
    let ahead = project.git.ahead.unwrap_or(0);
    let behind = project.git.behind.unwrap_or(0);
    let progress = project
        .build
        .as_ref()
        .map(|build| {
            let phase = build.next_phase.as_deref().unwrap_or("No open phase found");
            format!("{}/{} checked · {}", build.checked, build.total, phase)
        })
        .unwrap_or_else(|| "BUILD progress unavailable".to_owned());
    let title = if let Some(url) = project.target.public_url {
        format!(
            r#"<a href="{}">{}</a>"#,
            escape_html(url),
            escape_html(project.target.name),
        )
    } else {
        escape_html(project.target.name)
    };

    format!(
        r#"<article class="project-card">
  <div class="project-card-header">
    <h2>{}</h2>
    <span class="state state-{}">{}</span>
  </div>
  <p>{}</p>
  <dl>
    <div><dt>Branch</dt><dd>{}</dd></div>
    <div><dt>Upstream</dt><dd>{}</dd></div>
    <div><dt>Ahead / behind</dt><dd>{} / {}</dd></div>
    <div><dt>Worktree</dt><dd>{}</dd></div>
    <div><dt>Latest commit</dt><dd>{}</dd></div>
    <div><dt>Origin</dt><dd>{}</dd></div>
    <div><dt>BUILD progress</dt><dd>{}</dd></div>
  </dl>
</article>"#,
        title,
        state,
        state,
        escape_html(&project.reason),
        escape_html(branch),
        escape_html(upstream),
        ahead,
        behind,
        dirty,
        escape_html(&commit_age),
        remote,
        escape_html(&progress),
    )
}

fn incident_table_html(incidents: &[IncidentRecord]) -> String {
    if incidents.is_empty() {
        return empty_state("No incident records are stored yet.");
    }

    let rows = incidents
        .iter()
        .map(|incident| {
            let resolved = incident
                .resolved_at
                .map(format_time)
                .unwrap_or_else(|| "open".to_owned());
            format!(
                r#"<tr>
  <th scope="row">{}</th>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
                escape_html(&incident.title),
                escape_html(&incident.state),
                escape_html(&incident.affected_targets.join(", ")),
                format_time(incident.started_at),
                escape_html(&resolved),
                escape_html(&incident.public_notes),
            )
        })
        .collect::<Vec<_>>()
        .join("");

    table_html(
        &[
            "Incident", "State", "Affected", "Started", "Resolved", "Notes",
        ],
        rows,
    )
}

fn maintenance_table_html(windows: &[MaintenanceWindow]) -> String {
    if windows.is_empty() {
        return empty_state("No maintenance windows are stored yet.");
    }

    let rows = windows
        .iter()
        .map(|window| {
            format!(
                r#"<tr>
  <th scope="row">{}</th>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
                escape_html(&window.title),
                escape_html(&window.state),
                escape_html(&window.affected_targets.join(", ")),
                format_time(window.starts_at),
                format_time(window.ends_at),
                escape_html(&window.public_notes),
            )
        })
        .collect::<Vec<_>>()
        .join("");

    table_html(
        &["Window", "State", "Affected", "Starts", "Ends", "Notes"],
        rows,
    )
}

fn deployment_table_html(deployments: &[DeploymentEvent]) -> String {
    if deployments.is_empty() {
        return empty_state("No deployment records are stored yet.");
    }

    let rows = deployments
        .iter()
        .map(|deployment| {
            let service = deployment.service_id.as_deref().unwrap_or("unknown");
            let repo = deployment.repo_name.as_deref().unwrap_or("unknown");
            let commit = deployment
                .commit_sha
                .as_deref()
                .map(short_commit)
                .unwrap_or_else(|| "unknown".to_owned());
            format!(
                r#"<tr>
  <th scope="row">{}</th>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
                escape_html(service),
                escape_html(repo),
                escape_html(&commit),
                escape_html(&deployment.environment),
                format_time(deployment.deployed_at),
                escape_html(&deployment.public_summary),
            )
        })
        .collect::<Vec<_>>()
        .join("");

    table_html(
        &[
            "Service",
            "Repo",
            "Commit",
            "Environment",
            "Deployed",
            "Summary",
        ],
        rows,
    )
}

fn table_html(headings: &[&str], rows: String) -> String {
    let heading_html = headings
        .iter()
        .map(|heading| format!(r#"<th scope="col">{}</th>"#, escape_html(heading)))
        .collect::<Vec<_>>()
        .join("");

    format!(
        r#"<div class="table-wrap">
  <table class="status-table">
    <thead><tr>{heading_html}</tr></thead>
    <tbody>{rows}</tbody>
  </table>
</div>"#
    )
}

fn empty_state(message: &str) -> String {
    format!(r#"<p class="empty-state">{}</p>"#, escape_html(message))
}

fn short_commit(commit: &str) -> String {
    commit.chars().take(12).collect()
}

fn state_headline(state: StatusState) -> &'static str {
    match state {
        StatusState::Operational => "All monitored services are operational",
        StatusState::Degraded => "Some monitored services are degraded",
        StatusState::Down => "One or more monitored services are down",
        StatusState::Maintenance => "Maintenance is in progress",
        StatusState::Unknown => "Monitored service status is unknown",
    }
}

fn format_time(time: chrono::DateTime<chrono::Utc>) -> String {
    time.format("%Y-%m-%d %H:%M:%S UTC").to_string()
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CheckKind, CheckResult, MonitorTarget};
    use chrono::TimeZone;

    #[test]
    fn service_rows_escape_public_reason_text() {
        let checked_at = chrono::Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        let service = ServiceStatus {
            target: MonitorTarget {
                id: "example",
                name: "Example",
                group: "Sites",
                public_url: "https://example.com",
                probe_url: "https://example.com/healthz",
                expected_status: 200,
                expected_body_token: None,
            },
            check: CheckResult {
                target_id: "example",
                check_kind: CheckKind::Http,
                state: StatusState::Degraded,
                checked_at,
                latency_ms: Some(42),
                reason: "<bad>".to_owned(),
                probe_version: "test",
            },
        };

        let row = service_row_html(&service);

        assert!(row.contains("&lt;bad&gt;"));
        assert!(!row.contains("<bad>"));
    }

    #[test]
    fn project_cards_escape_public_reason_text() {
        let checked_at = chrono::Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        let project = ProjectStatus {
            target: crate::model::ProjectTarget {
                id: "example",
                name: "Example",
                repo_name: "example",
                public_url: Some("https://example.com"),
                repo_path: "/home/sawyer/github/example".to_owned(),
            },
            state: StatusState::Degraded,
            checked_at,
            reason: "<dirty>".to_owned(),
            git: crate::model::GitStatus {
                branch: Some("main".to_owned()),
                upstream: Some("origin/main".to_owned()),
                ahead: Some(0),
                behind: Some(1),
                dirty: Some(true),
                latest_commit_age_days: Some(3),
                remote_reachable: Some(true),
            },
            build: Some(crate::model::BuildProgress {
                checked: 1,
                total: 2,
                next_phase: Some("Phase 2".to_owned()),
            }),
            probe_version: "test",
        };

        let card = project_card_html(&project);

        assert!(card.contains("&lt;dirty&gt;"));
        assert!(!card.contains("<dirty>"));
        assert!(!card.contains("/home/sawyer"));
    }

    #[test]
    fn incident_pages_escape_public_notes() {
        let checked_at = chrono::Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        let html = incident_table_html(&[IncidentRecord {
            title: "Example".to_owned(),
            affected_targets: vec!["fileferry-app".to_owned()],
            state: "resolved".to_owned(),
            started_at: checked_at,
            resolved_at: Some(checked_at),
            public_notes: "<private>".to_owned(),
        }]);

        assert!(html.contains("&lt;private&gt;"));
        assert!(!html.contains("<private>"));
    }

    #[test]
    fn deployment_pages_shorten_commit_hashes() {
        let checked_at = chrono::Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();
        let html = deployment_table_html(&[DeploymentEvent {
            service_id: Some("fileferry-app".to_owned()),
            repo_name: Some("fileferry".to_owned()),
            commit_sha: Some("abcdef1234567890".to_owned()),
            environment: "production".to_owned(),
            deployed_at: checked_at,
            public_summary: "deployed".to_owned(),
        }]);

        assert!(html.contains("abcdef123456"));
        assert!(!html.contains("abcdef1234567890"));
    }
}
