# Browser request recovery validation, October 30, 2026

Local R4 continuation evidence. Changes remain local in commits of at most seven
files. No further history rewrite or push was performed. Existing dirty generated
WASM and unrelated audit files were preserved. Schema head remains 0015.

Environment: Windows PowerShell, Python 3.11.14, pytest 9.1.1, Node v24.11.0,
pnpm 9.15.0, Vitest 4.1.3 and pinned Pyright 1.1.411.

## Executed evidence

Server pytest uses `DATABASE_URL=sqlite:///:memory:` and empty
`DATABASE_MIGRATION_URL`. Selected the existing protocol/persistence/recovery
unit groups, table create/delete/settings and XP/receipt services, schema/model/
policy/writer tests, plus Alembic/PostgreSQL/trusted-session/multi-client integration
suites with `-q --no-cov --tb=short --show-capture=no`:
**686 passed, 51 skipped**. Skips are 46 PostgreSQL contract cases, one Alembic
case and four PostgreSQL multi-client cases; no disposable PostgreSQL URL is set.
Existing reconstructed-service duplicate tests remain the effect-once boundary.
New browser transport mocks do not establish database concurrency guarantees.

From `apps/web-ui`:
`pnpm.cmd exec vitest run --project jsdom src/lib/websocket src/lib/wasm/__tests__ src/lib/wasm/runtime/__tests__ src/features/table src/features/session/components/__tests__/OperationRecoveryNotice.test.tsx src/app/providers/__tests__/ProtocolProvider.test.tsx src/features/auth src/__tests__/gameStore.test.ts`:
**747 passed** across 40 files. A later targeted client protocol run adds two
copy/import reconstruction cases; all 218 protocol cases pass. Distinct browser
total: **749**.

`pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts`:
**two passed** in Chromium: generated-schema import under the server script CSP
and original-envelope reconstruction using actual tab storage. A first dependency
optimizer run reloaded the test page; both browser projects now prebundle the
generated validator's equality helper. The final run passed without that reload.

From `packages/core-table`, generated-binding drift check passes and
`python -m pytest tests/test_protocol_schema.py -q --tb=short`: **194 passed**.
Total distinct passing cases: **1,631**. Earlier targeted runs overlap these totals.

Static gates: pinned Pyright reports zero errors/warnings; TypeScript, targeted
ESLint/Ruff, notice Stylelint (including commit CSS hook), diff whitespace and
current-doc checks pass.

`pnpm.cmd run build` passes (TypeScript and Vite production bundling). The initial
sandboxed esbuild invocation was denied directory access; the permitted rerun
passed. Vite still reports main/core chunks over its 550-KiB warning threshold;
this run does not establish the R7 capacity/performance gate. The build uses the
existing locally modified WASM artifact and therefore is not committed-artifact
reproducibility evidence.

## Acceptance covered

- Original create/copy/import/delete/settings/XP messages survive tab-owner
  reconstruction with original identity, timestamp and body.
- Records are separated by authenticated actor, session code and retained
  database instance. Clearing a protocol context cannot discard another actor's
  evidence. No stored intent grants authority or replay under an unsupported server.
- Capacity, corrupt bytes, schema mismatch and storage failure retain evidence
  and prevent unsupported high-risk transmission. Per-key records preserve sibling
  requests. There is no age-based eviction into a fresh intent.
- Correlated domain receipts settle records; reads and unrelated successes do
  not. Unknown responses stay pending and denied lookups require review.
- Restored creation replies cannot reset a newer scene. Restored settings retain
  ownership. Saved-change controls retry original requests or explicitly forget
  records with an explanation that this does not cancel or undo a change.
- Welcome capability is opt-in so older closed validators remain compatible.

## Limits still open

Session storage is scoped to one tab and can disappear on tab closure or browser
storage clearing. This is not offline or browser-restart durability. Database
rollback restore requires separate journal invalidation/rehearsal under R6.
Generic character/choice and generic table commands are not automatically replayed
by this allowlisted journal. Real PostgreSQL/provider/served-candidate acceptance,
full candidate CI and paired restore remain open. Locally modified WASM artifacts
remain outside the committed candidate; no generated artifact rebuild was done.
