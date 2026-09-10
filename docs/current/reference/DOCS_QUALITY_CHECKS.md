# Docs Quality Checks

Audience: contributors changing files under `docs/current/`.

Status: current.

Last source audit: 2026-09-10

## Command

Run from the repository root:

```powershell
pnpm run docs:check
```

That calls:

```powershell
python scripts/check_docs.py
```

The script has no third-party Python dependencies.

The independent `docs` job in `.github/workflows/ci.yml` runs this command on
every pull request and push. Documentation failures do not wait for server or
browser dependency installation.

## What It Checks

The current checker walks `docs/current/**/*.md` and verifies:

- relative Markdown links resolve inside the repository;
- current reference, feature, operations, how-to, tutorial, and overview pages
  include `Last source audit:`;
- ADR pages under `docs/current/decisions/` include `Status:` and `Date:`.

External links and same-page anchors are skipped.

## Fixing Failures

For a broken relative link, update the target path or add the missing current
page. If the intended target is historical context, do not make it the primary
authority for a current page.

For metadata failures, add the missing source-audit or ADR header only after
checking the page against source code, tests, scripts, or config.

## What it does not prove

The checker does not execute commands, compare model tables or registered
messages to reference tables, validate source paths written in inline code,
check external URLs or heading anchors, or review semantic accuracy. It also
does not require audit dates on every root-level explanation page.

For a source change, compare the affected current guide with the implementation
and regression tests. Validate schema and protocol inventories separately,
and ensure new pages are reachable from the README/map. Source review is
required even when `docs:check` passes.
