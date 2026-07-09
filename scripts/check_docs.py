"""Check current documentation links and required metadata."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = ROOT / "docs" / "current"

LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
IMAGE_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def is_external(target: str) -> bool:
    lowered = target.lower()
    return (
        lowered.startswith("http://")
        or lowered.startswith("https://")
        or lowered.startswith("mailto:")
    )


def clean_target(target: str) -> str:
    target = target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1]
    if " " in target:
        target = target.split(" ", 1)[0]
    return unquote(target.split("#", 1)[0])


def check_links(path: Path, text: str) -> list[str]:
    errors: list[str] = []
    for match in [*LINK_RE.finditer(text), *IMAGE_RE.finditer(text)]:
        raw_target = match.group(1)
        target = clean_target(raw_target)
        if not target or target.startswith("#") or is_external(target):
            continue
        if target.startswith("/"):
            resolved = (ROOT / target.lstrip("/")).resolve()
        else:
            resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError:
            errors.append(f"{path}: link escapes repository: {raw_target}")
            continue
        if not resolved.exists():
            rel = path.relative_to(ROOT)
            errors.append(f"{rel}: broken link: {raw_target}")
    return errors


def check_metadata(path: Path, text: str) -> list[str]:
    rel = path.relative_to(DOCS_ROOT)
    errors: list[str] = []

    if rel.parts[0] in {"reference", "features", "operations", "how-to", "tutorials", "overview"}:
        if "Last source audit:" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing Last source audit")

    if rel.parts[0] == "decisions" and path.name != "README.md":
        if "Status:" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing ADR Status")
        if "Date:" not in text:
            errors.append(f"{path.relative_to(ROOT)}: missing ADR Date")

    return errors


def main() -> int:
    if not DOCS_ROOT.exists():
        print(f"Missing docs root: {DOCS_ROOT}", file=sys.stderr)
        return 1

    errors: list[str] = []
    for path in sorted(DOCS_ROOT.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        errors.extend(check_links(path, text))
        errors.extend(check_metadata(path, text))

    if errors:
        print("Documentation check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Documentation check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
