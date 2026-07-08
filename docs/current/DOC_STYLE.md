# Docs style

Audience: anyone adding or changing files in `docs/current/`.

Status: usable.

Last source audit: 2026-07-08

## Core rule

`docs/current/` describes the app as it works now. If a claim is not checked
against source code, tests, scripts, or config, do not write it as fact.

## Voice

Write like a teammate explaining the system:

- short sentences;
- active voice;
- concrete file paths;
- no hype;
- no "future will" language unless the page is explicitly a plan;
- no migration story unless it explains a current boundary.

Prefer:

> Combat mutations go through `CombatCommandService`.

Avoid:

> We should probably eventually move combat mutations into a service.

## Page shape

Use this small header when it helps:

```markdown
# Page title

Audience: who should read this.

Status: usable | partial | draft

Last source audit: YYYY-MM-DD
```

Use `Status: partial` when a page is correct but incomplete. Add a short
"Missing" or "Next" section rather than hiding gaps.

## What belongs here

Good `docs/current/` pages:

- explain current ownership;
- link to source paths and tests;
- document commands that actually exist;
- name the boundary where behavior changes;
- tell the reader which verification to run.

Keep these outside `docs/current/`:

- implementation plans;
- temporary progress notes;
- old audits;
- migration diaries;
- speculative design notes.

If an old document has useful truth, rewrite the useful part into a current
page instead of moving the whole old file.

## Links and paths

- Use relative links between docs pages.
- Use inline code for source paths, commands, message names, and identifiers.
- Link to the canonical page instead of copying the same rules in several
  places.
- Keep source references stable. Prefer directories or key files over long
  lists of every helper.

## Page size

Small is fine. A page is big enough when the reader can act without guessing.

Split a page when it mixes different reader needs:

- explanation: why the system is shaped this way;
- how-to: steps to complete one task;
- reference: complete facts and contracts;
- tutorial: guided first experience.

## Updating docs with code

Update docs in the same change when code changes:

- protocol messages;
- combat command payloads or authority rules;
- environment variables;
- database models or migrations;
- deployment steps;
- public user workflows;
- test commands or required checks;
- ownership between server, React, Rust/WASM, and `core-table`.

Incorrect docs are worse than missing docs. If you cannot verify a detail,
write the narrow fact you can verify and leave the open part explicit.
