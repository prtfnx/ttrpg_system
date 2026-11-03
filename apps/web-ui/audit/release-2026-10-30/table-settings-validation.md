# Table settings validation, October 30, 2026

Local R4 continuation evidence; not a release qualification.

History: 30 unpublished commits were redated for author and committer to
October 30 in Europe/Kyiv, preserving raw identities/messages, trees and order.
Backup: `backup/unpublished-before-redate-2026-10-30-55b2b006`.
Exactly the oldest 17 were pushed normally through
`15e35197fd5035d01df4d89c66e891e2eb18e997`; 13 remained before new implementation.
See [commit map](commit-map.json). Further implementation stays local, with no
commit exceeding seven files. Existing dirty WASM and historical audit files
were preserved; no generated WASM rebuild was performed.

Migration head: `0015_table_settings_revision`. Environment: Windows PowerShell,
Python 3.11.14, pytest 9.1.1, Node v24.11.0, pnpm 9.15.0, Vitest 4.1.3 and
Pyright 1.1.411. Server pytest uses `DATABASE_URL=sqlite:///:memory:` and empty
`DATABASE_MIGRATION_URL`, with `-q --no-cov --tb=short --show-capture=no`.

## Executed checks

From `apps/server`, pytest selected `tests/unit/test_*protocol*.py`,
`test_*persistence*.py`, `test_*recovery*.py`, plus table creation/deletion/settings
services, session operation receipts, XP service, schema lifecycle, model metadata,
command policy and application writer units, and Alembic/PostgreSQL/trusted-session/
multi-client integration suites: **681 passed, 51 skipped**. A later focused run
adds one nullable legacy-settings regression; the 30-case settings service suite
passes. Total distinct server cases passing: **682**. PostgreSQL skips comprise
46 contract cases, one Alembic case and four live multi-client cases because no
disposable `TEST_POSTGRESQL_DATABASE_URL` is configured.

From `packages/core-table`, `python -m pytest tests/test_protocol_schema.py -q --tb=short`:
**192 passed**. `python scripts/generate_protocol_types.py --check` passes.

From `apps/web-ui`:
`pnpm.cmd exec vitest run --project jsdom src/lib/websocket src/lib/wasm/__tests__ src/lib/wasm/runtime/__tests__ src/features/table src/__tests__/gameStore.test.ts`:
**675 passed** across 33 files.
`pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts`:
**one passed** in Chromium, validating the generated schema without dynamic code
generation. One sandboxed esbuild run failed on directory access; permitted
unsandboxed reruns passed. TypeScript, targeted ESLint/Ruff, pinned Pyright
(zero errors/warnings), generated bindings, diff whitespace and current docs pass.

Total distinct passing cases: **1,550**. Earlier targeted runs overlap these totals.

## Evidence boundaries

- Migration tests preserve existing settings while initializing revision zero;
  historical migration fixtures seed the old schema without current ORM columns.
- Foreign-key-enabled service tests cover atomic patch/revision/receipt rollback,
  no-op receipts, current-state restart/replay, changed-input reuse, numeric/color
  normalization, legacy nullable response defaults, target/authority/dirty-state
  denial, deleted-target replay, actor cleanup and commit-response outages.
- Real dispatch covers read/snapshot quarantine, cache failure recovery, actor
  removal, changed retry input and repeated cancellation through publication.
- Added PostgreSQL cases cover independent duplicate workers, atomic rollback and
  observed original-transaction session lock waits through commit/rollback. They
  collect but have not executed locally.
- Browser tests reject stale revisions, preserve newer pending intent, retain an
  unknown original message through canonical hydration, limit exact probes per
  connection, and release newer settings only after original settlement.

Persisted cross-page browser high-risk recovery, general character/choice outcomes,
real PostgreSQL migration/writer qualification, final candidate CI, paired restore
and served provider acceptance remain open. Existing locally modified WASM artifacts
remain outside the committed candidate; these checks do not qualify reproducibility.
