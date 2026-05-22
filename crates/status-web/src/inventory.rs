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
            "fileferry-app",
            "fileferry.app",
            "Public websites",
            "https://fileferry.app",
            "https://fileferry.app/healthz",
        ),
        target(
            "callrift-dev",
            "callrift.dev",
            "Public websites",
            "https://callrift.dev",
            "https://callrift.dev/healthz",
        ),
        target(
            "pod-tracker-app",
            "pod-tracker.app",
            "Public websites",
            "https://pod-tracker.app",
            "https://pod-tracker.app/healthz",
        ),
        target(
            "langindex-dev",
            "langindex.dev",
            "Public websites",
            "https://langindex.dev",
            "https://langindex.dev/healthz",
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
        project("callrift", "callrift", Some("https://callrift.dev")),
        project("c-from-the-ground-up", "c-from-the-ground-up", None),
        project(
            "dunamismax-com",
            "dunamismax.com",
            Some("https://dunamismax.com"),
        ),
        project("dunamismax", "dunamismax", None),
        project_named(
            "fileferry",
            "fileferry",
            "fileferry",
            Some("https://fileferry.app"),
        ),
        project("go-web-server", "go-web-server", None),
        project("hello-world-from-hell", "hello-world-from-hell", None),
        project("langindex", "langindex", Some("https://langindex.dev")),
        project("mtg-card-bot", "mtg-card-bot", None),
        project("myliferpg", "myliferpg", None),
        project(
            "pod-tracker",
            "pod-tracker",
            Some("https://pod-tracker.app"),
        ),
        project("rustdesk-selfhosted", "rustdesk-selfhosted", None),
        project(
            "status-dunamismax",
            "status.dunamismax",
            Some("https://status.dunamismax.com"),
        ),
        project("toolworks", "toolworks", None),
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

        assert_eq!(targets.len(), 7);
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

        assert_eq!(targets.len(), 15);
        assert!(targets.iter().any(|target| target.repo_name == "toolworks"));
        assert!(
            targets
                .iter()
                .any(|target| target.id == "fileferry" && target.repo_name == "fileferry")
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
