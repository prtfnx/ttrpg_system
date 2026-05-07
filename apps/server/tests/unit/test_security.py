"""Unit tests for utils/security.py — sanitization and validation functions."""
import pytest
from utils.security import sanitize_session_code, sanitize_user_input, validate_invite_code_format


class TestSanitizeSessionCode:
    def test_valid_code_passes(self):
        assert sanitize_session_code("ABCD1234") == "ABCD1234"

    def test_strips_whitespace(self):
        assert sanitize_session_code("  ABCD12  ") == "ABCD12"

    def test_none_raises(self):
        with pytest.raises(ValueError, match="empty"):
            sanitize_session_code(None)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="empty"):
            sanitize_session_code("")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="empty"):
            sanitize_session_code("   ")

    def test_too_long_raises(self):
        with pytest.raises(ValueError, match="long"):
            sanitize_session_code("A" * 21)

    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="short"):
            sanitize_session_code("ABC")

    def test_lowercase_raises(self):
        with pytest.raises(ValueError, match="invalid characters"):
            sanitize_session_code("abcd1234")

    def test_special_chars_raise(self):
        with pytest.raises(ValueError):
            sanitize_session_code("ABCD-12")

    def test_sql_comment_raises(self):
        # '--' contains non-alphanumeric chars so it's caught by the character check
        with pytest.raises(ValueError):
            sanitize_session_code("ABCD--12")

    def test_semicolon_raises(self):
        # ';' is a non-alphanumeric char caught by the character check
        with pytest.raises(ValueError):
            sanitize_session_code("ABCD;EFG")


class TestSanitizeUserInput:
    def test_valid_input_passes(self):
        assert sanitize_user_input("Hello World") == "Hello World"

    def test_strips_whitespace(self):
        assert sanitize_user_input("  hi  ") == "hi"

    def test_none_raises(self):
        with pytest.raises(ValueError, match="empty"):
            sanitize_user_input(None)

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="empty"):
            sanitize_user_input("")

    def test_too_long_raises(self):
        with pytest.raises(ValueError, match="long"):
            sanitize_user_input("a" * 300)

    def test_custom_max_length(self):
        with pytest.raises(ValueError):
            sanitize_user_input("hello", max_length=3)

    def test_script_tag_raises(self):
        with pytest.raises(ValueError, match="XSS"):
            sanitize_user_input("<script>alert(1)</script>")

    def test_javascript_protocol_raises(self):
        with pytest.raises(ValueError, match="XSS"):
            sanitize_user_input("javascript:alert(1)")

    def test_union_select_raises(self):
        with pytest.raises(ValueError, match="SQL"):
            sanitize_user_input("' UNION SELECT * FROM users--")

    def test_drop_table_raises(self):
        with pytest.raises(ValueError, match="SQL"):
            sanitize_user_input("DROP TABLE users")


class TestValidateInviteCodeFormat:
    def test_valid_code(self):
        assert validate_invite_code_format("AbCd1234EfGh") is True

    def test_none_returns_false(self):
        assert validate_invite_code_format(None) is False

    def test_empty_returns_false(self):
        assert validate_invite_code_format("") is False

    def test_too_short_returns_false(self):
        assert validate_invite_code_format("abc12") is False

    def test_too_long_returns_false(self):
        assert validate_invite_code_format("A" * 33) is False

    def test_special_chars_return_false(self):
        assert validate_invite_code_format("abc-def-123") is False

    def test_minimum_length(self):
        assert validate_invite_code_format("abcd1234") is True

    def test_maximum_length(self):
        assert validate_invite_code_format("A" * 32) is True
