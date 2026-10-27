"""The CI gate must reject missing backend coverage as well as test failures."""
from xml.etree import ElementTree

import pytest
from scripts.check_postgresql_gate import REQUIRED_SUITES, check_report


def write_report(tmp_path, *, omitted=None, outcome=None, backend="postgresql"):
    root = ElementTree.Element("testsuites")
    suite = ElementTree.SubElement(root, "testsuite")
    for name in sorted(REQUIRED_SUITES - {omitted}):
        case = ElementTree.SubElement(suite, "testcase", classname=f"tests.integration.{name}",
                                      name=f"test_behavior[{backend}]" if name == "test_multiclient_sync" else "test_behavior")
        if name == "test_canvas_history_postgresql" and outcome:
            ElementTree.SubElement(case, outcome)
    path = tmp_path / "postgresql.xml"
    ElementTree.ElementTree(root).write(path, encoding="utf-8")
    return path


def test_gate_accepts_executed_postgresql_suites(tmp_path):
    assert check_report(write_report(tmp_path)) == len(REQUIRED_SUITES)


@pytest.mark.parametrize("outcome", ["skipped", "failure", "error"])
def test_gate_rejects_unsuccessful_or_skipped_cases(tmp_path, outcome):
    with pytest.raises(ValueError, match="skipped or unsuccessful"):
        check_report(write_report(tmp_path, outcome=outcome))


@pytest.mark.parametrize("omitted", sorted(REQUIRED_SUITES))
def test_gate_requires_each_expected_suite(tmp_path, omitted):
    with pytest.raises(ValueError, match="required suites"):
        check_report(write_report(tmp_path, omitted=omitted))


def test_gate_rejects_sqlite_only_multiclient_coverage(tmp_path):
    with pytest.raises(ValueError, match="PostgreSQL multi-client"):
        check_report(write_report(tmp_path, backend="sqlite"))


def test_gate_rejects_empty_report(tmp_path):
    path = tmp_path / "empty.xml"
    path.write_text("<testsuites/>", encoding="utf-8")
    with pytest.raises(ValueError, match="required suites"):
        check_report(path)
