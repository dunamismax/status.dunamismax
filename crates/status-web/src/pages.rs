use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use leptos::prelude::*;
use leptos::tachys::view::RenderHtml;

use crate::model::{ServiceStatus, StatusSnapshot, StatusState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavSection {
    Overview,
    Services,
    Projects,
    Incidents,
    Deployments,
}

pub fn overview(snapshot: &StatusSnapshot) -> Response {
    let affected = snapshot.summary.degraded + snapshot.summary.down + snapshot.summary.unknown;
    let body = format!(
        r#"
<section class="status-band">
  <div>
    <p class="eyebrow">Public ecosystem status</p>
    <h1>{}</h1>
    <p class="lede">{} of {} public checks need attention. Last checked {}.</p>
  </div>
  {}
</section>
<section class="section">
  <div class="section-heading">
    <h2>Public checks</h2>
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
      <h1>Public services</h1>
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

    format!(
        r#"<tr>
  <th scope="row"><a href="{}">{}</a><span>{}</span></th>
  <td><span class="state state-{}">{}</span></td>
  <td>{}</td>
  <td>{}</td>
  <td>{}</td>
</tr>"#,
        escape_html(service.target.public_url),
        escape_html(service.target.name),
        escape_html(service.target.group),
        state,
        state,
        escape_html(&latency),
        format_time(service.check.checked_at),
        escape_html(&service.check.reason),
    )
}

fn state_headline(state: StatusState) -> &'static str {
    match state {
        StatusState::Operational => "All monitored public services are operational",
        StatusState::Degraded => "Some monitored public services are degraded",
        StatusState::Down => "One or more monitored public services are down",
        StatusState::Maintenance => "Maintenance is in progress",
        StatusState::Unknown => "Public service status is unknown",
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
}
