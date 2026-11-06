# November 3 extended recovery validation

Date: 2026-11-03, Europe/Kiev.

This continuation closes the plan's compatible same-tab original-request
ownership gap for character/repair, choice and multiclass. It does not declare
the functional-release backlog or provider/candidate acceptance complete.

## History boundary

- Rewrote all 41 unpublished linear commits to November 3 author/committer dates.
  Raw identities, messages, trees, order, index and existing tracked changes were
  preserved. Backup: `backup/unpublished-before-redate-2026-11-03-02a01cac`.
- Fast-forward pushed exactly the oldest 18 to `origin/main` at
  `f91fe659416a77d46400558cc72864009d74e682`, confirmed with `git ls-remote`.
- The rewritten tip was `5030982435cc9acdc7db2bbceed8f4504fcb93ef`, leaving
  23 rewritten commits local. See [the commit map](commit-map.json).
- Subsequent implementation/docs commits stay local and contain at most six
  files each. No force push, subsequent push or WASM regeneration was performed.

## Implemented contract

- Explicit v2 opt-in adds `character_update`, `choice_encounter` and
  `character_multiclass`. The original four-domain v1 contract remains closed.
  Clients offer v1 fallback alongside v2 so older servers can retain v1 recovery.
- The same bounded tab journal writes complete original identities, timestamps,
  targets, patches/digests and optional versions before sending. V2 originals
  remain dormant when only v1 is advertised. Other actor/session/instance records
  remain untouched and cannot be replayed or forgotten under the new scope.
- Owner/co-DM roles may probe advertised requests. Player/trusted roles may probe
  character, multiclass and choice/roll requests. Other saved requests remain held
  for review; current database edit/participant authority still gates the server.
- Restored character edits regain pending ownership and defer current-state
  hydration until all edits settle. Unknown/denied outcomes retain the original;
  restored conflicts cannot silently issue a new rebased write. Explicit
  nonacceptance requires correlated operation identity before clearing evidence.
- Generic multiclass uncertainty causes one bounded read probe, never a new
  mutation. Small receipts hydrate current source even before the character list
  loads. A saved historical patch/classes list is never installed as current data.
- Retained reconnect work waits for authenticated welcome. Same-page actor or
  database-instance changes clear old in-memory character owners. Only journaled
  requests are removed from connection queues for journal replay; unsupported
  requests retain their existing queue ownership.
- Explicit forgetting releases matching local edit owners and asks for current
  state without canceling an earlier server effect. Storage admission failure
  prevents transmission and removes phantom local edit ownership.

## Verification

| Check | Result |
| --- | --- |
| Browser protocol, shared protocol, character and combat suites | 1,298 passed in 74 files |
| Server game-session protocol and retained recovery scope suites | 55 passed |
| Shared protocol, choice, multiclass and canvas schema suites | 332 passed |
| Native Chromium message/CSP and tab-storage checks | 5 passed |
| TypeScript and targeted ESLint | Passed |
| Targeted Ruff and pinned Pyright 1.1.411 | Passed; zero type errors/warnings |
| Protocol generator `--check` | Current |
| Production browser build | Passed; 2,153 modules |
| Current docs and whitespace checks | Passed |

These selected suites contain 1,690 distinct passing cases. They add no
PostgreSQL qualification: the previously unqualified 64 PostgreSQL contracts and
one PostgreSQL Alembic case remain release gates, requiring a disposable target.
No SQL acceptance algorithm or database migration changed in this slice.

Representative commands, from `apps/web-ui` unless specified:

```powershell
pnpm.cmd exec vitest run --project jsdom src/lib/websocket/__tests__ src/shared/protocol/__tests__ src/features/character src/features/combat
pnpm.cmd exec vitest run --project browser-components src/lib/websocket/message.browser-test.ts
pnpm.cmd run build
../../.venv311/Scripts/python.exe ../../packages/core-table/scripts/generate_protocol_types.py --check
../../.venv311/Scripts/python.exe -m pytest ../../packages/core-table/tests/test_protocol_schema.py ../../packages/core-table/tests/test_choice_protocol_schema.py ../../packages/core-table/tests/test_multiclass_protocol_schema.py ../../packages/core-table/tests/test_canvas_protocol_schema.py -q --no-cov --tb=short
../../.venv311/Scripts/python.exe ../../scripts/check_docs.py
```

Server tests, from `apps/server`, use `DATABASE_URL=sqlite:///:memory:` and an
empty `DATABASE_MIGRATION_URL`, then:

```powershell
../../.venv311/Scripts/python.exe -m pytest tests/unit/test_game_session_protocol.py tests/unit/test_session_join_recovery_context.py -q --no-cov --tb=short --show-capture=no
pnpm.cmd dlx pyright@1.1.411
```

The final build reused the existing modified 3,314.89-KiB WASM artifact, which was
neither committed nor regenerated. Main/core JavaScript chunks are 561.19 and
798.46 kB; the known 550-kB chunk warning remains. This is build validation, not
reproducible optimized-WASM or packaged served-candidate qualification.

## Remaining release work

1. Settle remaining generic table/sprite uncertain commits against durable state.
2. Qualify R2 active-combat sheet/token/encounter field authority and explicit
   legacy conflict decisions without implicit new gameplay writeback.
3. Complete R5 expiry/sign-in/resume and sensitive-producer authority acceptance.
4. Rehearse R6 paired DB/R2 capture/manifest/restore and invalidate receipt/browser
   timelines before clients resume after a database rollback.
5. Run R0/R7 disposable PostgreSQL no-skip gates, reproducible optimized WASM,
   packaged FastAPI/real-R2 flows, candidate CI and multi-role load acceptance.

Tab closure/storage clearing can lose browser evidence. The session instance is
a retained row identity, not a restore generation; this slice does not solve
restore-timeline invalidation or guarantee browser-restart/offline durability.
