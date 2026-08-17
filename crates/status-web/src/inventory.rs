use std::path::Path;

use crate::model::{MonitorTarget, ProjectTarget};

pub fn public_targets() -> Vec<MonitorTarget> {
    vec![
        target(
            "dunamismax-com",
            "dunamismax.com",
            "Public websites",
            "https://dunamismax.com",
            "https://dunamismax.com/healthz",
        ),
        target(
            "status-dunamismax-com",
            "status.dunamismax.com",
            "Public websites",
            "https://status.dunamismax.com",
            "https://status.dunamismax.com/healthz",
        ),
        target(
            "xrayservice-net",
            "xrayservice.net",
            "Public websites",
            "https://xrayservice.net",
            "https://xrayservice.net/",
        ),
    ]
}

pub fn project_targets() -> Vec<ProjectTarget> {
    let root = repository_root();

    [
        project(
            "dunamismax-com",
            "dunamismax.com",
            Some("https://dunamismax.com"),
        ),
        project("mtg-card-bot", "mtg-card-bot", None),
        project("podgauge", "podgauge", None),
        project("rustdesk-selfhosted", "rustdesk-selfhosted", None),
        project(
            "status-dunamismax",
            "status.dunamismax",
            Some("https://status.dunamismax.com"),
        ),
        project(
            "xrayservice",
            "xrayservice",
            Some("https://xrayservice.net"),
        ),
    ]
    .into_iter()
    .map(|mut target| {
        target.repo_path = format!("{root}/{}", target.repo_name);
        target
    })
    .collect()
}

fn target(
    id: &'static str,
    name: &'static str,
    group: &'static str,
    public_url: &'static str,
    probe_url: &'static str,
) -> MonitorTarget {
    MonitorTarget {
        id,
        name,
        group,
        public_url,
        probe_url,
        expected_status: 200,
        expected_body_token: None,
    }
}

fn project(
    id: &'static str,
    repo_name: &'static str,
    public_url: Option<&'static str>,
) -> ProjectTarget {
    project_named(id, repo_name, repo_name, public_url)
}

fn project_named(
    id: &'static str,
    name: &'static str,
    repo_name: &'static str,
    public_url: Option<&'static str>,
) -> ProjectTarget {
    ProjectTarget {
        id,
        name,
        repo_name,
        public_url,
        repo_path: String::new(),
    }
}

fn repository_root() -> String {
    if let Ok(root) = std::env::var("STATUS_REPO_ROOT") {
        return root;
    }

    for candidate in ["/home/sawyer/github", "/Users/sawyer/github"] {
        if Path::new(candidate).is_dir() {
            return candidate.to_owned();
        }
    }

    "/home/sawyer/github".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inventory_contains_initial_public_targets() {
        let targets = public_targets();

        assert_eq!(targets.len(), 3);
        assert!(
            targets
                .iter()
                .any(|target| target.id == "status-dunamismax-com")
        );
        assert!(targets.iter().all(|target| target.expected_status == 200));
        assert!(
            targets
                .iter()
                .all(|target| target.probe_url.starts_with("https://"))
        );
    }

    #[test]
    fn project_inventory_contains_initial_repos_without_public_paths() {
        let targets = project_targets();

        assert_eq!(targets.len(), 6);
        assert!(targets.iter().any(|target| target.repo_name == "podgauge"));
        assert!(
            targets
                .iter()
                .any(|target| target.repo_name == "mtg-card-bot")
        );
        assert!(
            targets
                .iter()
                .any(|target| target.repo_name == "status.dunamismax")
        );
        assert!(targets.iter().all(|target| !target.repo_path.is_empty()));

        let json = serde_json::to_string(&targets[0]).expect("project target JSON");
        assert!(!json.contains("repo_path"));
        assert!(!json.contains("/home/sawyer"));
        assert!(!json.contains("/Users/sawyer"));
    }
}
