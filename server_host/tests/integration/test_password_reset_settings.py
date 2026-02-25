"""
Integration tests for forgot-password, reset-password, settings, and email-change flows.
Tests real HTTP behaviour via the TestClient — no implementation detail mocking except email sends.
"""
import hashlib
import secrets
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch

from server_host.database import models, crud, schemas


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_reset_token(db, user):
    """Insert a valid (unexpired, unused) reset token, return the raw token string."""
    raw = secrets.token_urlsafe(32)
    db.add(models.PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    db.commit()
    return raw


def _make_email_change_token(db, user, new_email):
    """Insert a valid pending email change, return the raw token string."""
    raw = secrets.token_urlsafe(32)
    db.add(models.PendingEmailChange(
        user_id=user.id,
        new_email=new_email,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    ))
    db.commit()
    return raw


def _set_password(db, user, password):
    """Set an explicit password on user (simulates password-based account)."""
    user.hashed_password = crud.get_password_hash(password)
    user.password_set_at = datetime.utcnow()
    db.commit()


# ─── Forgot Password ──────────────────────────────────────────────────────────

@pytest.mark.integration
class TestForgotPassword:
    def test_page_renders(self, client):
        response = client.get("/users/forgot-password")
        assert response.status_code == 200

    def test_always_shows_sent_page_for_known_email(self, client, test_user):
        with patch("server_host.routers.users.send_password_reset"):
            response = client.post("/users/forgot-password", data={"email": test_user.email})
        assert response.status_code == 200

    def test_always_shows_sent_page_for_unknown_email(self, client):
        # Same page regardless — no user enumeration
        response = client.post("/users/forgot-password", data={"email": "ghost@nowhere.com"})
        assert response.status_code == 200

    def test_creates_reset_token_in_db(self, client, test_user, test_db):
        with patch("server_host.routers.users.send_password_reset"):
            client.post("/users/forgot-password", data={"email": test_user.email})

        token = test_db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == test_user.id
        ).first()
        assert token is not None
        assert token.used is False

    def test_new_request_invalidates_old_token(self, client, test_user, test_db):
        with patch("server_host.routers.users.send_password_reset"):
            client.post("/users/forgot-password", data={"email": test_user.email})
            client.post("/users/forgot-password", data={"email": test_user.email})

        active = test_db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == test_user.id,
            models.PasswordResetToken.used == False,
        ).count()
        assert active == 1  # Only one active token at a time

    def test_rate_limit(self, client):
        for _ in range(3):
            client.post("/users/forgot-password", data={"email": "x@x.com"})
        response = client.post("/users/forgot-password", data={"email": "x@x.com"})
        assert response.status_code == 429


# ─── Reset Password ───────────────────────────────────────────────────────────

@pytest.mark.integration
class TestResetPassword:
    def test_page_with_valid_token_renders(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        response = client.get(f"/users/reset-password?token={raw}")
        assert response.status_code == 200

    def test_no_token_redirects(self, client):
        response = client.get("/users/reset-password", follow_redirects=False)
        assert response.status_code == 302

    def test_invalid_token_shows_error(self, client):
        response = client.get("/users/reset-password?token=notarealtoken")
        assert response.status_code == 400

    def test_successful_reset_redirects_to_login(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        with patch("server_host.routers.users.send_password_changed"):
            response = client.post("/users/reset-password", data={
                "token": raw,
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            }, follow_redirects=False)
        assert response.status_code == 302
        assert "login" in response.headers["location"]
        assert "password_reset_success" in response.headers["location"]

    def test_reset_bumps_session_version(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        old_sv = test_user.session_version or 0
        with patch("server_host.routers.users.send_password_changed"):
            client.post("/users/reset-password", data={
                "token": raw,
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            })
        test_db.refresh(test_user)
        assert (test_user.session_version or 0) == old_sv + 1

    def test_token_is_single_use(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        with patch("server_host.routers.users.send_password_changed"):
            client.post("/users/reset-password", data={
                "token": raw,
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            })
        # Same token rejected on second attempt
        response = client.post("/users/reset-password", data={
            "token": raw,
            "new_password": "AnotherPass1",
            "confirm_password": "AnotherPass1",
        })
        assert response.status_code == 400

    def test_mismatched_passwords_rejected(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        response = client.post("/users/reset-password", data={
            "token": raw,
            "new_password": "NewSecret1",
            "confirm_password": "Different1",
        })
        assert response.status_code == 400

    def test_weak_password_rejected(self, client, test_user, test_db):
        raw = _make_reset_token(test_db, test_user)
        response = client.post("/users/reset-password", data={
            "token": raw,
            "new_password": "weak",
            "confirm_password": "weak",
        })
        assert response.status_code == 400

    def test_expired_token_rejected(self, client, test_user, test_db):
        raw = secrets.token_urlsafe(32)
        test_db.add(models.PasswordResetToken(
            user_id=test_user.id,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            expires_at=datetime.utcnow() - timedelta(minutes=1),  # already expired
        ))
        test_db.commit()
        response = client.post("/users/reset-password", data={
            "token": raw,
            "new_password": "NewSecret1",
            "confirm_password": "NewSecret1",
        })
        assert response.status_code == 400


# ─── Settings ─────────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestSettings:
    def test_requires_auth(self, client):
        response = client.get("/users/settings", follow_redirects=False)
        assert response.status_code in (302, 401)

    def test_page_renders(self, auth_client):
        response = auth_client.get("/users/settings")
        assert response.status_code == 200

    def test_profile_update_saves_name(self, auth_client, test_db, test_user):
        response = auth_client.post("/users/settings/profile", data={
            "full_name": "Jane Doe"
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "profile_updated" in response.headers["location"]
        test_db.refresh(test_user)
        assert test_user.full_name == "Jane Doe"

    def test_profile_update_clears_name_when_empty(self, auth_client, test_db, test_user):
        test_user.full_name = "Old Name"
        test_db.commit()
        auth_client.post("/users/settings/profile", data={"full_name": ""})
        test_db.refresh(test_user)
        assert test_user.full_name is None

    def test_password_set_oauth_user_no_current_required(self, auth_client, test_db, test_user):
        """OAuth user (password_set_at=None) can set a first password without providing current."""
        assert test_user.password_set_at is None
        with patch("server_host.routers.users.send_password_changed"):
            response = auth_client.post("/users/settings/password", data={
                "current_password": "",
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            }, follow_redirects=False)
        assert response.status_code == 302
        assert "password_changed" in response.headers["location"]
        test_db.refresh(test_user)
        assert test_user.password_set_at is not None

    def test_password_change_wrong_current_rejected(self, auth_client, test_db, test_user):
        _set_password(test_db, test_user, "OldSecret1")
        response = auth_client.post("/users/settings/password", data={
            "current_password": "WrongPass1",
            "new_password": "NewSecret1",
            "confirm_password": "NewSecret1",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_password_change_mismatch_rejected(self, auth_client, test_db, test_user):
        _set_password(test_db, test_user, "OldSecret1")
        response = auth_client.post("/users/settings/password", data={
            "current_password": "OldSecret1",
            "new_password": "NewSecret1",
            "confirm_password": "DiffSecret1",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_password_same_as_current_rejected(self, auth_client, test_db, test_user):
        _set_password(test_db, test_user, "OldSecret1")
        with patch("server_host.routers.users.send_password_changed"):
            response = auth_client.post("/users/settings/password", data={
                "current_password": "OldSecret1",
                "new_password": "OldSecret1",
                "confirm_password": "OldSecret1",
            }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_password_change_bumps_session_version(self, auth_client, test_db, test_user):
        old_sv = test_user.session_version or 0
        with patch("server_host.routers.users.send_password_changed"):
            auth_client.post("/users/settings/password", data={
                "current_password": "",
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            })
        test_db.refresh(test_user)
        assert (test_user.session_version or 0) == old_sv + 1

    def test_password_change_issues_new_cookie(self, auth_client):
        with patch("server_host.routers.users.send_password_changed"):
            response = auth_client.post("/users/settings/password", data={
                "current_password": "",
                "new_password": "NewSecret1",
                "confirm_password": "NewSecret1",
            }, follow_redirects=False)
        assert "token" in response.cookies

    def test_delete_wrong_username_rejected(self, auth_client, test_user):
        response = auth_client.post("/users/settings/delete", data={
            "username_confirm": "notmyusername",
            "password": "whatever",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_delete_wrong_password_rejected(self, auth_client, test_db, test_user):
        _set_password(test_db, test_user, "RealPass1")
        response = auth_client.post("/users/settings/delete", data={
            "username_confirm": test_user.username,
            "password": "WrongPass1",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_delete_disables_account_and_clears_cookie(self, auth_client, test_db, test_user):
        test_user.password_set_at = None  # OAuth user — no password check
        test_db.commit()
        response = auth_client.post("/users/settings/delete", data={
            "username_confirm": test_user.username,
            "password": "",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "account_deleted" in response.headers["location"]
        test_db.refresh(test_user)
        assert test_user.disabled is True


# ─── Email Change ─────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestEmailChange:
    def test_wrong_password_rejected(self, auth_client, test_db, test_user):
        _set_password(test_db, test_user, "SecretPass1")
        response = auth_client.post("/users/settings/email", data={
            "new_email": "new@example.com",
            "password": "WrongPass1",
        }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_already_taken_email_rejected(self, auth_client, test_db, test_user):
        crud.create_user(test_db, schemas.UserCreate(
            username="other", email="taken@example.com", password="OtherPass1"
        ))
        test_user.password_set_at = None  # skip password check
        test_db.commit()

        with patch("server_host.routers.users.send_email_change_verify"), \
             patch("server_host.routers.users.send_email_change_notify"):
            response = auth_client.post("/users/settings/email", data={
                "new_email": "taken@example.com",
                "password": "",
            }, follow_redirects=False)
        assert response.status_code == 302
        assert "error" in response.headers["location"]

    def test_creates_pending_record(self, auth_client, test_db, test_user):
        test_user.password_set_at = None
        test_db.commit()

        with patch("server_host.routers.users.send_email_change_verify"), \
             patch("server_host.routers.users.send_email_change_notify"):
            response = auth_client.post("/users/settings/email", data={
                "new_email": "changed@example.com",
                "password": "",
            }, follow_redirects=False)

        assert response.status_code == 302
        assert "verification_email_sent" in response.headers["location"]

        record = test_db.query(models.PendingEmailChange).filter(
            models.PendingEmailChange.user_id == test_user.id
        ).first()
        assert record is not None
        assert record.new_email == "changed@example.com"
        assert record.used is False

    def test_verify_updates_email(self, client, test_db, test_user):
        raw = _make_email_change_token(test_db, test_user, "verified@example.com")
        response = client.get(f"/users/verify-email-change?token={raw}", follow_redirects=False)
        assert response.status_code == 302
        assert "email_changed" in response.headers["location"]
        test_db.refresh(test_user)
        assert test_user.email == "verified@example.com"

    def test_verify_invalid_token_shows_error(self, client):
        response = client.get("/users/verify-email-change?token=badtoken")
        assert response.status_code == 400

    def test_verify_no_token_redirects(self, client):
        response = client.get("/users/verify-email-change", follow_redirects=False)
        assert response.status_code == 302

    def test_verify_token_is_single_use(self, client, test_db, test_user):
        raw = _make_email_change_token(test_db, test_user, "once@example.com")
        client.get(f"/users/verify-email-change?token={raw}")
        # Second click on same link
        response = client.get(f"/users/verify-email-change?token={raw}")
        assert response.status_code == 400
