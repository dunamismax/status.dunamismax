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
- [x] Production reconciliation: all seven table digests match; subsequent writes retained.
- [x] Commit/dual-push, deploy, production/access checks and real reverse-migration rollback.
- [x] PostgreSQL-aware daily backup passed restore; Toolworks integration dual-pushed.
- [x] Encrypted shared backup/restore and normal timer observation (10:35:12 UTC).

See docs/migration.md for completed acceptance results. Rollups remain retained
indefinitely; richer incident/maintenance authoring remains an operator SQL task.
