"""Tests for the server's Python runtime contract."""

import pytest
from utils.runtime import require_supported_python


@pytest.mark.parametrize("version_info", [(3, 11, 0), (3, 12, 9), (4, 0, 0)])
def test_supported_python_versions_are_accepted(version_info: tuple[int, int, int]) -> None:
    require_supported_python(version_info)


def test_unsupported_python_version_exits_with_actionable_message() -> None:
    with pytest.raises(SystemExit) as error:
        require_supported_python((3, 10, 18))

    message = str(error.value)
    assert "requires Python 3.11 or newer" in message
    assert "found Python 3.10.18" in message
    assert ".venv311" in message
