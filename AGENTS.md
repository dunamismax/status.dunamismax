# Operating guidance

Read README.md, BUILD.md, docs/architecture.md, docs/production.md and the current
`/home/sawyer/github/ubuntu-vm-backup/docs/astro-migration.md` before changing the
live service. The final target is Astro + PostgreSQL + Drizzle. BUILD.md Phase 0
adopts Drizzle into the existing application; retain Astro Node standalone SSR,
the host TypeScript collector and systemd deployment. Python and Swift are used
only when actually needed or explicitly requested, not as mandatory conversions.
Preserve private source visibility and the owner's content/access boundaries.

Reality first: do not invent uptime, hide unknown/stale evidence or claim checks
that did not run. This is an observer, never a restart panel, deploy orchestrator,
remote shell or command-output feed. No private paths, arguments, env values,
credentials, topology, database names, logs or stack traces on public routes.
Only bearer-authenticated /operator may show its deliberate private metadata.

Use Node 24.22.1/npm 11.19.1 at /opt/astro-runtime through astro-runtime. Exact
versions, package-lock.json and npm ci; strict TypeScript with noUncheckedIndexedAccess
and exactOptionalPropertyTypes. Astro standalone SSR, semantic HTML, existing
vanilla CSS, no browser JavaScript, inline style, fonts or analytics for current
pages. Drizzle ORM 0.45.4 (Kit 0.31.11, dev-only) wraps the existing pg driver. React islands,
Tailwind and shadcn/ui are available only for an actual interactive UI need;
Astro Actions/API endpoints only for needed forms/server or client APIs. Preserve
current no-script behavior until a concrete feature justifies changing it.
No unnecessary framework, hosted monitoring or container migration.

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

Verification: npm ci, npm run check, npm run db:check, npm test, bash tests/postgres.sh, npm run build,
bash -n deploy/*.sh, Python compile and git diff --check. PostgreSQL integration runs
only in its disposable private cluster. For production verify failures, role grants,
process env/file separation, timers, fresh snapshots, static bytes, headers, API
compatibility, rollback/data reconciliation and encrypted backup restore.

## Final stack and layout (Phase 0 in progress)

- Web: Astro `src/pages/`, server-only `src/lib/`, semantic HTML/current CSS.
  Keep `@astrojs/node` standalone server output for this database-backed observer.
  Static output is appropriate for other content-only projects, not live status.
- Database: native PostgreSQL 18, `status_dunamismax`, schema `app`, separate
  owner/migration/web/collector roles. Typed schema `src/db/schema.ts`, reviewed
  migrations in `drizzle/` (baseline catalog `drizzle/baseline-catalog.json`),
  `drizzle.config.ts` and owner-only runner `src/db/migrate.ts` (`npm run db:migrate`,
  `--adopt-baseline` for an existing matching schema). Journal `app.drizzle_migrations`
  is private to the owner. Never `drizzle-kit push`. Production adoption pending.
  Preserve exactly four web-readable models and no future-table default grants.
- Hosting: existing systemd units, `/srv/www/status.dunamismax.com/releases/<commit>`,
  atomic `current`, web 127.0.0.1:4313 and candidate 127.0.0.1:14313. No required
  Compose conversion. Root-only role settings stay in `/etc/astro-apps/status_dunamismax/`
  and app settings in `/etc/status-dunamismax/astro-{web,collector}.env`.
- Caddy: `/etc/caddy/Caddyfile`, owning fragment
  `/etc/caddy/sites/status.dunamismax.com.caddy`, binary `/usr/local/lib/caddy/caddy`.
  Preserve current modules/TLS; Full (strict) when Cloudflare proxies DNS. Any
  DNS-challenge plugin/token work belongs to shared host integration, Caddy only.
- Backups: nightly pg_dump with roles/ACLs/settings, encrypted off-host copies and
  isolated restores. Keep PostgreSQL; SQLite/Litestream are not target requirements.
- Conditional product additions: Better Auth with PostgreSQL for requested accounts,
  Vercel AI SDK inside Astro endpoints for needed LLM features. Neither is needed
  by this observer; preserve bearer-only `/operator` and read-only web access.
- Conditional native work: Swift/SwiftUI on Apple platforms only when needed or
  requested. Record Swift/minimum OS versions and a working xcodebuild/test command;
  prefer @Observable where supported, SwiftData or GRDB as appropriate. Clients
  call Astro HTTPS APIs, never the server database. No native target is planned here.
- Conditional Python work: use uv, locked dependencies and ruff; choose Typer/httpx/
  Pydantic only as needed, systemd timers for recurring jobs. Keep the working
  TypeScript collector and existing Python recovery/probe utilities; no language
  rewrite solely for uniformity. Future Python changes should adopt that tooling.
- Do not create extra language-template/continuity files here. Update this existing
  guidance with actual implemented versions/commands when such work is introduced.

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
