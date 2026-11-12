# Combat field authority and legacy token fences

Date: November 11, 2026, Europe/Kiev.

## Publication boundary

Fifteen unpublished commits were redated to November 11. Their trees, messages,
identities, ordering and local times were preserved; index and preexisting dirty
files were verified unchanged. Backup branch
backup/unpublished-before-redate-2026-11-11-a1c977ea and commit-map.json preserve
the original/new mapping. Exactly the oldest 11 were pushed through 81b71368.
Four prior commits stayed local. New implementation commits follow that push.

The final publication check found a dependency missed before the push: the
11-commit prefix stops before session wire-contract commit e914a986. Its schema
rejects an otherwise valid session_settings/outcome_unknown error containing the
domain, while the complete local schema accepts it. The next two existing
commits, 585b209d and e914a986, include the editor and required schema completion.
The requested limit was preserved; no extra push was made. The pushed prefix is
not a complete session-recovery release candidate. This limitation is separate
from the passing full-local-tree authority tests below.

## Confirmed defects and fixes

CombatantFactory previously let token HP/max-HP/AC override a loaded canonical
character, so a stale projection could change encounter starting values. It
could also borrow a flat client character link for a saved unlinked token.
Character SQL errors were swallowed and could cause stale/client fallback data
to enter a newly accepted encounter.

Database-backed entry now requires a token in its selected table and reads its
saved identity/controllers. Canonical linked character HP/maxHp/AC takes priority
over token and client hints; zero/null clears cannot revive stale projections.
Null/unset entry values use combat defaults 0/0/10. Missing, archived, invalid,
unmigrated legacy or unavailable linked sources reject before snapshot/journal
acceptance. Protocol errors omit private database details. Existing explicit
supported DM entry overrides remain encounter-only. An added combatant must use
the active table. Non-database factory consumers keep compatibility fallbacks.

Raw sprite commands previously avoided canvas combat restrictions by becoming
non-reversible receipts. That still allowed deleting a combat token or changing
its character link, controller or saved stat fields behind the encounter snapshot.
The acceptance transaction now reads current SQL membership and rejects these
changes, including for DMs. Cached membership also fences in-memory combat.
Legacy null phases count as active; canvas uses the same scoped membership reader
under its existing stricter fence. A denied member rolls back an entire durable
run and produces no accepted journal row. Cosmetics and the existing DM movement
override retain their rules. Removing the combatant first allows the relevant
unlinked stat/delete/rebind changes under normal permissions.

Persistent character source/projections and encounter resources remain separate
field owners. Sheet edits and uncertain-save recovery update persistent values
without overwriting current encounter HP/AC/resources. Reconnect/reconstruction
preserves those encounter values. Completion performs no implicit write-back;
the next encounter reads current persistent source values. Existing legacy
dry-run/exact-digest repair remains outside active combat. No schema, wire,
browser or WASM changes are introduced.

## Verification

- Broad server suite: **1,575 passed, 107 skipped**, 1,682 collected. Selected
  sprite/canvas/combat/choice/encounter/character/persistence/table/wall/fog/layer/
  session/receipt/XP units plus trusted reconstruction, PostgreSQL contracts and
  Alembic baseline. Final focused source-recovery rerun also passes; repeated
  cases are not added to the distinct count.
- **34 new regressions**: 14 raw token fences/run rollback/cosmetic/removal cases,
  one canvas null-phase case, ten factory source/identity/override cases, three
  command rejection/table-scope cases, four protocol source-outage cases and two
  character commit/lookup recovery cases with active encounter resources.
- The existing trusted workflow now injects a stale linked AC projection before
  combat, verifies canonical entry, edits persistent AC during combat, rejects a
  raw independent HP update, reconstructs both field owners, verifies no HP
  write-back on completion, and starts another encounter with the updated AC.
- PostgreSQL-dependent skips: **106 contracts plus one Alembic case**. Four new
  contracts cover current/legacy-null-phase raw stat/delete denial with no
  receipts or entity changes. No disposable PostgreSQL target is configured;
  skips do **not** qualify real PostgreSQL locking or release acceptance.
- Pinned Pyright 1.1.411: **zero errors/warnings** after explicit optional-state
  assertions. Targeted Ruff, docs, generated binding and diff checks pass. The
  initial sandbox denial of the pnpm path was resolved by the pinned checker
  running with escalation.
- Frontend and WASM were not changed or rebuilt for this backend-only slice.
  Prior browser/build results are not added to these test counts. Existing
  modified WASM and unrelated audit artifacts were preserved. Reproducible
  optimized WASM and large-chunk qualification remain open.

## Remaining work

Next local review: R5 auth expiry/resume and private-producer acceptance. R2/R4
real PostgreSQL and served reconnect/repair qualification, R6 paired database/R2
restore and timeline invalidation, and R0/R7 optimized WASM, exact-candidate CI
and load gates remain open. These local checks do not establish universal session
atomicity, an automatic encounter-to-sheet merge or untrusted-client secrecy.

Five focused new local commits, each at most seven files, separate token guards,
combat entry, workflow/recovery evidence, current docs and plan/publication
evidence. They were not pushed.
