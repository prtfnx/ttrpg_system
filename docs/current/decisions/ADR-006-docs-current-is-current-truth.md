# ADR-006: Docs Current Is Current Truth

Status: accepted
Date: 2026-07-09

## Context

The repository has durable documentation, plans, progress notes, audits, and
historical migration material. Mixing those into one reader path makes it hard
to know whether a page describes the app as it works now or a past/future task.

Current docs already separate these concerns:

- `docs/current/README.md` is the entry point for current documentation.
- `docs/current/DOC_STYLE.md` defines the house style.
- `docs/current/DOCS_MAP.md` maps current pages and maintenance notes.
- `docs/DOCUMENTATION_COMPLETION_PLAN_2026-07-08.md` and
  `docs/DOCUMENTATION_PROGRESS_2026-07-08.md` stay outside `docs/current/`.

## Decision

`docs/current/` contains source-verified current truth. Plans, progress notes,
audits, and historical migration narratives stay outside `docs/current/`.

When old documents contain still-accurate facts, rewrite the useful part into a
current page instead of moving the old document unchanged.

## Consequences

- Current docs must point to code, tests, scripts, config, or another current
  doc as their basis.
- Speculation belongs in plans or issues, not current reference or feature
  pages.
- Progress files are useful coordination notes, but they are not durable docs
  and should not be linked as primary authority.
- New durable pages need a reader need, a clear owner, and links from the docs
  map when they become part of `docs/current/`.

## Links

- [Current documentation](../README.md)
- [Docs style](../DOC_STYLE.md)
- [Documentation map](../DOCS_MAP.md)
