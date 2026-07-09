# Docs Quality Checks

Audience: contributors changing files under `docs/current/`.

Status: new.

Last source audit: 2026-07-09

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
