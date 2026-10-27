"""Require the selected PostgreSQL CI suites to execute without skips."""
from __future__ import annotations

import sys
from pathlib import Path
from xml.etree import ElementTree

REQUIRED_SUITES = frozenset({
    "test_alembic_baseline",
    "test_postgresql_contract",
    "test_writer_fencing_postgresql",
    "test_canvas_history_postgresql",
    "test_multiclient_sync",
})


def check_report(path: Path) -> int:
    cases = list(ElementTree.parse(path).iter("testcase"))
    failed = [case for case in cases if any(case.find(tag) is not None for tag in ("skipped", "failure", "error"))]
    if failed:
        raise ValueError(f"PostgreSQL gate contains {len(failed)} skipped or unsuccessful cases")
    suites = {part for case in cases for part in case.get("classname", "").split(".")}
    missing = REQUIRED_SUITES - suites
    if missing:
        raise ValueError(f"PostgreSQL gate did not execute required suites: {', '.join(sorted(missing))}")
    if not any("test_multiclient_sync" in case.get("classname", "").split(".")
               and case.get("name", "").endswith("[postgresql]") for case in cases):
        raise ValueError("PostgreSQL multi-client cases did not execute")
    return len(cases)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: check_postgresql_gate.py <pytest-junit.xml>", file=sys.stderr)
        return 1
    try:
        count = check_report(Path(sys.argv[1]))
    except (OSError, ElementTree.ParseError, ValueError) as exc:
        print(f"PostgreSQL gate failed: {exc}", file=sys.stderr)
        return 1
    print(f"PostgreSQL gate verified: {count} cases, all required suites, no skips")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
