"""Unit tests for utils/audit.py — pure functions and DB-mocked functions."""
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from utils.audit import (
    create_audit_log,
    extract_client_info,
    filter_audit_logs,
    format_audit_details,
    get_audit_summary,
)


class TestExtractClientInfo:
    def test_extracts_forwarded_ip(self):
        req = MagicMock()
        req.headers = {"x-forwarded-for": "1.2.3.4, 5.6.7.8"}
        req.client.host = "10.0.0.1"
        info = extract_client_info(req)
        assert info["ip_address"] == "1.2.3.4"

    def test_falls_back_to_client_host(self):
        req = MagicMock()
        req.headers = {}
        req.client.host = "10.0.0.1"
        info = extract_client_info(req)
        assert info["ip_address"] == "10.0.0.1"

    def test_extracts_user_agent(self):
        req = MagicMock()
        req.headers = {"user-agent": "Mozilla/5.0"}
        req.client = None
        info = extract_client_info(req)
        assert info["user_agent"] == "Mozilla/5.0"

    def test_missing_headers_returns_none(self):
        req = MagicMock()
        req.headers = {}
        req.client = None
        info = extract_client_info(req)
        assert info["ip_address"] is None
        assert info["user_agent"] is None


class TestFormatAuditDetails:
    def test_includes_event_type(self):
        result = format_audit_details("login", {"user": "alice"})
        assert "login" in result
        assert "alice" in result

    def test_redacts_password(self):
        result = format_audit_details("register", {"password": "secret123"})
        assert "secret123" not in result
        assert "[REDACTED]" in result

    def test_redacts_token(self):
        result = format_audit_details("auth", {"token": "abc123"})
        assert "abc123" not in result
        assert "[REDACTED]" in result

    def test_non_sensitive_keys_visible(self):
        result = format_audit_details("kick", {"target_user": "bob", "reason": "afk"})
        assert "bob" in result
        assert "afk" in result


class TestCreateAuditLog:
    def test_creates_audit_log_with_db(self):
        db = MagicMock()
        log = create_audit_log(db, "player_kicked", session_code="ABC1", user_id=1)
        db.add.assert_called_once_with(log)
        db.commit.assert_called_once()
        assert log.event_type == "player_kicked"

    def test_formats_additional_data_when_no_details(self):
        db = MagicMock()
        log = create_audit_log(db, "login", additional_data={"ip": "1.2.3.4"})
        assert "1.2.3.4" in log.details

    def test_appends_additional_data_to_existing_details(self):
        db = MagicMock()
        log = create_audit_log(
            db, "login", details="manual note", additional_data={"ip": "1.2.3.4"}
        )
        assert "manual note" in log.details
        assert "1.2.3.4" in log.details

    def test_rollback_on_db_error(self):
        db = MagicMock()
        db.commit.side_effect = Exception("DB error")
        with pytest.raises(Exception, match="DB error"):
            create_audit_log(db, "event")
        db.rollback.assert_called_once()


class TestFilterAuditLogs:
    def _logs(self):
        return [
            {"event_type": "login", "session_code": "S1", "user_id": 1, "timestamp": "2026-01-01T00:00:00Z"},
            {"event_type": "kick", "session_code": "S1", "user_id": 2, "timestamp": "2026-01-02T00:00:00Z"},
            {"event_type": "login", "session_code": "S2", "user_id": 1, "timestamp": "2026-01-03T00:00:00Z"},
        ]

    def test_filter_by_event_type(self):
        result = filter_audit_logs(self._logs(), event_types=["login"])
        assert len(result) == 2
        assert all(log["event_type"] == "login" for log in result)

    def test_filter_by_session_code(self):
        result = filter_audit_logs(self._logs(), session_code="S2")
        assert len(result) == 1

    def test_filter_by_user_id(self):
        result = filter_audit_logs(self._logs(), user_id=2)
        assert len(result) == 1
        assert result[0]["event_type"] == "kick"

    def test_filter_by_date_range(self):
        from datetime import timezone
        start = datetime(2026, 1, 2, tzinfo=timezone.utc)
        result = filter_audit_logs(self._logs(), start_date=start)
        assert len(result) == 2

    def test_no_filters_returns_all(self):
        assert len(filter_audit_logs(self._logs())) == 3


class TestGetAuditSummary:
    def test_returns_summary_structure(self):
        db = MagicMock()
        log1 = MagicMock(event_type="login", user_id=1)
        log2 = MagicMock(event_type="login", user_id=2)
        log3 = MagicMock(event_type="kick", user_id=1)
        db.query.return_value.filter.return_value.all.return_value = [log1, log2, log3]

        summary = get_audit_summary(db, "TEST", days=7)
        assert summary["total_events"] == 3
        assert summary["event_types"]["login"] == 2
        assert summary["unique_users"] == 2
        assert summary["session_code"] == "TEST"
