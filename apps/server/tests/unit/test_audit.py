"""Unit tests for the normalized security-audit boundary."""

import json
from unittest.mock import MagicMock

from utils.audit import (
    audit_event,
    extract_client_info,
    format_audit_details,
    persist_http_security_decision,
)
from utils.logger import log_context


class TestExtractClientInfo:
    def test_extracts_forwarded_ip(self):
        request = MagicMock()
        request.headers = {"x-forwarded-for": "1.2.3.4, 5.6.7.8"}
        request.client.host = "10.0.0.1"
        assert extract_client_info(request)["ip_address"] == "1.2.3.4"

    def test_falls_back_to_client_host(self):
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.1"
        assert extract_client_info(request)["ip_address"] == "10.0.0.1"

    def test_extracts_user_agent(self):
        request = MagicMock()
        request.headers = {"user-agent": "Mozilla/5.0"}
        request.client = None
        assert extract_client_info(request)["user_agent"] == "Mozilla/5.0"

    def test_missing_headers_returns_none(self):
        request = MagicMock()
        request.headers = {}
        request.client = None
        info = extract_client_info(request)
        assert info["ip_address"] is None
        assert info["user_agent"] is None


class TestFormatAuditDetails:
    def test_includes_event_type(self):
        result = format_audit_details("login", {"user": "alice"})
        assert "login" in result
        assert "alice" in result

    def test_redacts_secrets_recursively(self):
        result = format_audit_details(
            "register", {"nested": {"password": "secret123", "token": "abc123"}}
        )
        assert "secret123" not in result
        assert "abc123" not in result
        assert "[REDACTED]" in result

    def test_non_sensitive_keys_visible(self):
        result = format_audit_details("kick", {"target_user": "bob", "reason": "afk"})
        assert "bob" in result
        assert "afk" in result


class TestAuditEvent:
    def test_correlates_and_recursively_redacts_details(self):
        with log_context(request_id="req-12345678", trace_id="a" * 32):
            row = audit_event(
                "account_changed",
                details={"nested": {"token": "secret-token", "field": "safe"}},
            )
        payload = json.loads(row.details_json)
        assert row.request_id == "req-12345678"
        assert row.trace_id == "a" * 32
        assert payload["data"]["nested"]["token"] == "[REDACTED]"
        assert payload["data"]["nested"]["field"] == "safe"

    def test_denied_http_decision_commits_independently(self, monkeypatch):
        db = MagicMock()
        monkeypatch.setattr("utils.audit.SessionLocal", lambda: db)
        request = MagicMock()
        request.state.user_id = 17
        request.method = "DELETE"
        request.headers = {}
        request.client = None

        persist_http_security_decision(request, 403, "/api/sessions/{session_code}")

        row = db.add.call_args.args[0]
        assert row.action == "authorization.http_denied"
        assert row.outcome == "denied"
        assert row.user_id == 17
        assert row.target_id == "/api/sessions/{session_code}"
        db.commit.assert_called_once()
        db.close.assert_called_once()
