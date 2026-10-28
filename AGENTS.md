# Operating guidance

Read README.md, BUILD.md, docs/architecture.md, docs/production.md and the current
`/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` before changing the
live service. This Astro/strict TypeScript/PostgreSQL migration supersedes the old
PHP/MySQL stack restrictions. Preserve private source visibility and the owner's
explicit content, access and deployment boundaries.

Reality first: do not invent uptime, hide unknown/stale evidence or claim checks
that did not run. This is an observer, never a restart panel, deploy orchestrator,
remote shell or command-output feed. No private paths, arguments, env values,
credentials, topology, database names, logs or stack traces on public routes.
Only bearer-authenticated /operator may show its deliberate private metadata.

Use Node 24.22.1/npm 11.19.1 at /opt/astro-runtime through astro-runtime. Exact
versions, package-lock.json and npm ci; strict TypeScript with noUncheckedIndexedAccess
and exactOptionalPropertyTypes. Astro standalone SSR, semantic HTML, existing
vanilla CSS, no browser JavaScript, inline style, fonts or analytics. No unnecessary
framework, ORM, hosted monitoring or container migration.

Web code under src/lib and src/pages only reads four permitted PostgreSQL models.
It never imports collector code, runs commands, probes URLs or reads repositories.
Keep OS identities, root-only role env files, Node permission restrictions, read-only
filesystem, PostgreSQL grants and no owner/writer membership as independent controls.
Future tables must not automatically gain web SELECT access. Neither process gets
the other's env/token/webhook. Never add collector to Docker or widen repository ACLs.

All probe subprocesses go through CommandRunner's replacement command.ts: absolute
path, argv array, no shell, minimal nonsecret env, deadline, bounded output. Preserve
HTTP/TLS/redirect/body limits, TCP connect-only probes, one-shot freshness/restart
rules, custom Caddy binary /usr/local/lib/caddy/caddy and permission=unknown behavior.
Do not fetch/pull/clean/reset monitored repositories. Raw outputs are never persisted.

Preserve states, target IDs, JSON fields, original history IDs/timestamps, incident
and maintenance history, deployment metadata, alert keys/caps/repeat/sent evidence,
check-only retention and freshness labels. Change dependencies readiness label only
when its actual backing technology changes; preserve its response shape/status.
Test alerts only with mock/loopback endpoints or explicit --no-notify/--dry-run.

Build/test candidates outside the shared lock. All shared systemd/Caddy/ACL/roles/schema,
release and rollback mutations run in one VM transaction under with-deploy-lock,
reusing inherited FD9. Recheck current state, back up files/data, validate candidate
on loopback, atomic switch, custom Caddy validation/reload, public smoke. Stop both
writers for history reconciliation and reverse migration. Keep old services, releases,
MySQL data and backups until the host final cleanup. No force-pushes, unrelated site
edits or shared service restarts.

Before committing inspect branch/status/remotes and configured dunamismax identity.
Use clean fast-forward updates and origin dual-push to GitHub/Codeberg; verify both
tips. Never add assistant/co-author attribution. Never commit env files, dumps,
private snapshots, generated output or node_modules. Keep docs current in the same
change. Do not create extra instruction/continuity files.

Verification: npm ci, npm run check, npm test, bash tests/postgres.sh, npm run build,
bash -n deploy/*.sh, Python compile and git diff --check. PostgreSQL integration runs
only in its disposable private cluster. For production verify failures, role grants,
process env/file separation, timers, fresh snapshots, static bytes, headers, API
compatibility, rollback/data reconciliation and encrypted backup restore.

## Git rules (owner's standing instructions)

These override any other workflow described in this repository or by your tools.

- Work on `main` only. Never create branches, worktrees or pull requests.
  Commit directly to `main` and push with `git push origin main`. `origin`
  pushes to both GitHub and Codeberg, so one push updates both.
- No AI attribution anywhere: no `Co-Authored-By` trailers, no "Generated
  with ..." lines, and no crediting Claude, Anthropic, ChatGPT, OpenAI or any
  AI tool in commit messages, tags, release notes, code, comments or file
  headers. Use the owner's configured git identity and never change git config.
  Content the project deliberately publishes about AI, such as a reader-facing
  disclosure, is not attribution.
- After committing, push `main` right away, at the latest before the session
  ends. Before committing, run the project's checks, review `git status` for
  stray files, and never commit what `.gitignore` excludes.
