use std::{path::Path, time::Duration};

use chrono::{DateTime, Utc};
use tokio::{process::Command, task::JoinSet};

use crate::{
    inventory::project_targets,
    model::{BuildProgress, GitStatus, ProjectStatus, ProjectTarget, StatusState},
};

const GIT_PROBE_VERSION: &str = "git-project-v1";
const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const STALE_COMMIT_DAYS: i64 = 30;

pub async fn collect_project_status() -> Vec<ProjectStatus> {
    let mut probes = JoinSet::new();

    for target in project_targets() {
        probes.spawn(async move { probe_project(target).await });
    }

    let mut projects = Vec::new();
    while let Some(result) = probes.join_next().await {
        match result {
            Ok(project) => projects.push(project),
            Err(error) => tracing::warn!(%error, "project probe task failed"),
        }
    }

    projects
}

pub async fn probe_project(target: ProjectTarget) -> ProjectStatus {
    let checked_at = Utc::now();

    if !Path::new(&target.repo_path).join(".git").is_dir() {
        return ProjectStatus {
            target,
            state: StatusState::Unknown,
            checked_at,
            reason: "repository checkout was not found".to_owned(),
            git: GitStatus::unknown(),
            build: None,
            probe_version: GIT_PROBE_VERSION,
        };
    }

    let branch = git_output(&target.repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await;
    let upstream = git_output(
        &target.repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .await
    .ok();
    let ahead_behind = if upstream.is_some() {
        git_output(
            &target.repo_path,
            &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
        )
        .await
        .ok()
        .and_then(|output| parse_ahead_behind(&output))
    } else {
        None
    };
    let dirty = git_output(&target.repo_path, &["status", "--porcelain=v1"])
        .await
        .ok()
        .map(|output| !output.trim().is_empty());
    let latest_commit_age_days = git_output(&target.repo_path, &["log", "-1", "--format=%cI"])
        .await
        .ok()
        .and_then(|output| parse_commit_age_days(&output, checked_at));
    let remote_reachable = Some(
        git_output(
            &target.repo_path,
            &["ls-remote", "--exit-code", "origin", "HEAD"],
        )
        .await
        .is_ok(),
    );
    let build = std::fs::read_to_string(Path::new(&target.repo_path).join("BUILD.md"))
        .ok()
        .and_then(|contents| parse_build_progress(&contents));

    let git = GitStatus {
        branch: branch.ok(),
        upstream,
        ahead: ahead_behind.map(|counts| counts.0),
        behind: ahead_behind.map(|counts| counts.1),
        dirty,
        latest_commit_age_days,
        remote_reachable,
    };
    let (state, reason) = evaluate_project_status(&git, build.as_ref());

    ProjectStatus {
        target,
        state,
        checked_at,
        reason,
        git,
        build,
        probe_version: GIT_PROBE_VERSION,
    }
}

impl GitStatus {
    fn unknown() -> Self {
        Self {
            branch: None,
            upstream: None,
            ahead: None,
            behind: None,
            dirty: None,
            latest_commit_age_days: None,
            remote_reachable: None,
        }
    }
}

async fn git_output(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = tokio::time::timeout(
        GIT_COMMAND_TIMEOUT,
        Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .args(args)
            .output(),
    )
    .await
    .map_err(|_| "git command timed out".to_owned())?
    .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err("git command failed".to_owned());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn parse_ahead_behind(output: &str) -> Option<(u32, u32)> {
    let mut parts = output.split_whitespace();
    let left = parts.next()?.parse().ok()?;
    let right = parts.next()?.parse().ok()?;
    Some((right, left))
}

fn parse_commit_age_days(output: &str, checked_at: DateTime<Utc>) -> Option<i64> {
    let committed_at = DateTime::parse_from_rfc3339(output.trim())
        .ok()?
        .with_timezone(&Utc);
    Some(
        checked_at
            .signed_duration_since(committed_at)
            .num_days()
            .max(0),
    )
}

fn parse_build_progress(contents: &str) -> Option<BuildProgress> {
    let mut checked = 0;
    let mut total = 0;
    let mut active_phase: Option<String> = None;
    let mut section_has_unchecked = false;
    let mut next_phase = None;

    for line in contents.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("### ") {
            if section_has_unchecked && next_phase.is_none() {
                next_phase = active_phase.take();
            }
            active_phase = Some(heading.to_owned());
            section_has_unchecked = false;
            continue;
        }

        if trimmed.starts_with("- [x]") || trimmed.starts_with("- [X]") {
            checked += 1;
            total += 1;
        } else if trimmed.starts_with("- [ ]") {
            total += 1;
            section_has_unchecked = true;
        }
    }

    if section_has_unchecked && next_phase.is_none() {
        next_phase = active_phase;
    }

    (total > 0).then_some(BuildProgress {
        checked,
        total,
        next_phase,
    })
}

fn evaluate_project_status(
    git: &GitStatus,
    build: Option<&BuildProgress>,
) -> (StatusState, String) {
    if git.branch.is_none() {
        return (
            StatusState::Unknown,
            "git branch could not be read".to_owned(),
        );
    }

    let mut reasons = Vec::new();

    if git.dirty == Some(true) {
        reasons.push("working tree has uncommitted changes".to_owned());
    }

    match (git.ahead.unwrap_or(0), git.behind.unwrap_or(0)) {
        (ahead, behind) if ahead > 0 && behind > 0 => {
            reasons.push(format!(
                "branch is {ahead} ahead and {behind} behind upstream"
            ));
        }
        (ahead, _) if ahead > 0 => reasons.push(format!("branch is {ahead} ahead of upstream")),
        (_, behind) if behind > 0 => reasons.push(format!("branch is {behind} behind upstream")),
        _ => {}
    }

    if git.upstream.is_none() {
        reasons.push("upstream branch is not configured".to_owned());
    }

    if git.remote_reachable == Some(false) {
        reasons.push("origin remote was not reachable".to_owned());
    }

    if let Some(age) = git.latest_commit_age_days
        && age > STALE_COMMIT_DAYS
    {
        reasons.push(format!("latest commit is {age} days old"));
    }

    if reasons.is_empty() {
        let progress = build
            .map(|progress| format!("BUILD progress {}/{}", progress.checked, progress.total))
            .unwrap_or_else(|| "BUILD progress unavailable".to_owned());
        (
            StatusState::Operational,
            format!("repository is current; {progress}"),
        )
    } else {
        (StatusState::Degraded, reasons.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn parses_rev_list_counts_as_ahead_behind() {
        assert_eq!(parse_ahead_behind("3\t2"), Some((2, 3)));
    }

    #[test]
    fn parses_commit_age_from_git_iso_timestamp() {
        let checked_at = Utc.with_ymd_and_hms(2026, 5, 18, 12, 0, 0).unwrap();

        let age = parse_commit_age_days("2026-05-16T12:00:00+00:00", checked_at);

        assert_eq!(age, Some(2));
    }

    #[test]
    fn parses_build_checkbox_progress_and_next_phase() {
        let progress = parse_build_progress(
            r#"
### Phase 1: Done
- [x] Add app.

### Phase 2: Open
- [x] Add probe.
- [ ] Add history.
"#,
        )
        .expect("progress");

        assert_eq!(progress.checked, 2);
        assert_eq!(progress.total, 3);
        assert_eq!(progress.next_phase.as_deref(), Some("Phase 2: Open"));
    }

    #[test]
    fn dirty_or_diverged_projects_are_degraded_with_public_safe_reason() {
        let git = GitStatus {
            branch: Some("main".to_owned()),
            upstream: Some("origin/main".to_owned()),
            ahead: Some(1),
            behind: Some(2),
            dirty: Some(true),
            latest_commit_age_days: Some(2),
            remote_reachable: Some(true),
        };

        let (state, reason) = evaluate_project_status(&git, None);

        assert_eq!(state, StatusState::Degraded);
        assert!(reason.contains("uncommitted changes"));
        assert!(reason.contains("1 ahead and 2 behind"));
        assert!(!reason.contains("/home/sawyer"));
    }
}
