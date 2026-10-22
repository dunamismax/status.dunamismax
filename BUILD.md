# Current implementation and verification

Astro + strict TypeScript + PostgreSQL migration, October 22, 2026.

- [x] Preserve routes, JSON structures, HTML/CSS behavior and operator boundary.
- [x] Separate public reads from bounded collector probes/writes.
- [x] Preserve incidents, maintenance, deployments, alerts, suppression and retention.
- [x] Add transactional history transfer with original IDs and every-row digests.
- [x] Add candidate deployment, shared-lock rollback and PostgreSQL backup verification.
- [x] Remove superseded PHP application, collectors, tests and deployment scripts.
- [x] Strict checks, automated behavior tests and isolated PostgreSQL integration.
- [x] Full historical-data rehearsal (259,587 checks, 17,312 rollups; all seven table digests).
- [ ] Complete production reconciliation.
- [ ] Commit/dual-push, deploy, production/timer/access checks, rollback rehearsal.
- [ ] Verify and push post-cutover backups, encrypted restore and integration updates.

See docs/migration.md for completed acceptance results. Rollups remain retained
indefinitely; richer incident/maintenance authoring remains an operator SQL task.
