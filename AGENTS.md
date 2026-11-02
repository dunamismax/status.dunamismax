# Operating guidance

Read README.md, BUILD.md, docs/architecture.md, docs/production.md and the current
`/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` before changing the
live service. BUILD.md Phase 0 is the first unfinished work: replace the current
Astro web application with Next.js/React/Tailwind/shadcn/ui, adopt Drizzle over the
existing PostgreSQL database, and deploy the web server with Docker Compose.
This target supersedes the Astro-only, vanilla-CSS-only, no-ORM and no-web-container
restrictions. It does not describe an already implemented migration. Preserve
private source visibility and the owner's content, access and deployment boundaries.

Reality first: do not invent uptime, hide unknown/stale evidence or claim checks
that did not run. This is an observer, never a restart panel, deploy orchestrator,
remote shell or command-output feed. No private paths, arguments, env values,
credentials, topology, database names, logs or stack traces on public routes.
Only bearer-authenticated /operator may show its deliberate private metadata.

Current commands use Node 24.22.1/npm 11.19.1 at /opt/astro-runtime through
astro-runtime. Keep exact versions, package-lock.json and npm ci; strict TypeScript
with noUncheckedIndexedAccess and exactOptionalPropertyTypes. Phase 0 targets the
Next.js App Router, output: 'standalone', server-rendered React, compiled Tailwind
and only needed shadcn/ui components. Core status content must work without browser
JavaScript; framework scripts require a tested CSP. No analytics or remote fonts.
Better Auth, Stripe, AI SDK, Tauri and Expo are conditional future choices, not
requirements of this read-only observer. Keep the existing bearer operator contract.

Current web code under src/lib and src/pages (target: src/app, src/components and
server-only src/lib modules) only reads four permitted PostgreSQL models.
It never imports collector code, runs commands, probes URLs or reads repositories.
Keep OS identities, root-only role env files, tested Node permission restrictions,
read-only filesystem, PostgreSQL grants and no owner/writer membership as independent
controls. Do not silently discard a control to make the Next.js container start.
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

## Target layout and hosting conventions (Phase 0; not implemented yet)

- Web: `src/app/`, `src/components/`, server-only `src/lib/`; Next standalone
  `server.js` plus `public/` and `.next/static/`. Collector: `src/collector/`,
  separately compiled and run only on the host. Shared pure models contain no probes.
- Database: retain native PostgreSQL 18, database `status_dunamismax`, schema `app`,
  separate `status_dunamismax_{owner,migration,web,collector}` roles. TypeScript
  schema under `src/db/`, reviewed migrations under `drizzle/`, owner-only runner.
- Deployment files to add: `Dockerfile`, `.dockerignore`, `compose.yaml`; immutable
  commit-tagged/digest-recorded web image. Proposed Compose project
  `status-dunamismax`; no collector/PostgreSQL/Caddy containers in this project.
- Keep public upstream `127.0.0.1:4313`; candidate loopback `127.0.0.1:14313`.
  Default internal port 3000; explicitly publish only loopback. Reserve/check ports
  under the shared lock. Connect to native PG through a narrowly mounted Unix socket
  with scoped SCRAM authentication; container loopback is not host loopback.
- Keep `/etc/caddy/Caddyfile`, owning fragment
  `/etc/caddy/sites/status.dunamismax.com.caddy`, binary `/usr/local/lib/caddy/caddy`.
  Cloudflare Full (strict) when proxied; retain/add DNS plugin through host-owned
  integration, with a scoped token available only to Caddy. Never replace its other
  compiled modules or put a competing proxy/dashboard in front of this app.
- Existing root-only `/etc/astro-apps/status_dunamismax/` role files and
  `/etc/status-dunamismax/astro-{web,collector}.env` remain until a backed-up,
  reversible path transition. The web container receives web settings only.
- Keep `/srv/www/status.dunamismax.com/releases/<commit>` and atomic `current`;
  root-controlled Compose lifecycle outside the observer. Preserve collector IDs,
  timer, CLI wrapper and repository ACLs; no Docker socket/group for either runtime.
- Nightly PG dumps, roles/ACLs, secrets, image reconstruction/recovery and off-host
  encrypted copies must be covered by existing backups and isolated restore drills.
  Reconcile shared runbooks/integrations before cutover; this documentation change
  does not alter host configuration. See BUILD.md for the ordered acceptance gates.

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
