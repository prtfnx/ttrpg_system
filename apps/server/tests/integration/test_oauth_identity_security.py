"""Regression coverage for OAuth account pre-hijacking and provider claims."""
from types import SimpleNamespace

import pytest
from database import crud, models
from routers import auth


def configure_provider(monkeypatch, **claims):
    async def authorize_access_token(_request):
        return {"userinfo": claims}

    monkeypatch.setattr(auth, "OAUTH_CONFIGURED", True)
    monkeypatch.setattr(auth, "oauth", SimpleNamespace(
        google=SimpleNamespace(authorize_access_token=authorize_access_token),
    ))


@pytest.mark.parametrize("verified, bound_subject", [
    (False, None), (True, None), (True, "another-google-subject"),
])
def test_email_match_never_links_existing_account(
    client, test_db, test_user, monkeypatch, verified, bound_subject,
):
    test_user.is_verified = verified
    test_user.google_id = bound_subject
    test_db.commit()
    original_password = test_user.hashed_password
    configure_provider(monkeypatch, sub="new-google-subject", email=test_user.email,
                       email_verified=True)
    response = client.get("/auth/callback?code=valid", follow_redirects=False)
    assert response.headers["location"].startswith("/users/login?")
    assert "token" not in response.cookies
    test_db.refresh(test_user)
    assert test_user.hashed_password == original_password
    assert test_user.is_verified is verified
    assert test_user.google_id == bound_subject
    assert test_db.query(models.AuditLog).filter_by(
        action="authentication.oauth", outcome="failure",
    ).count() == 1


@pytest.mark.parametrize("verified", [None, False, "true", 1])
def test_unverified_claim_cannot_create_account(client, test_db, monkeypatch, verified):
    configure_provider(monkeypatch, sub="new-subject", email="oauth-new@example.com",
                       email_verified=verified)
    response = client.get("/auth/callback?code=valid", follow_redirects=False)
    assert "token" not in response.cookies
    assert test_db.query(models.User).filter_by(google_id="new-subject").first() is None


def test_disabled_bound_identity_cannot_sign_in(client, test_db, test_user, monkeypatch):
    test_user.google_id = "disabled-subject"
    test_user.disabled = True
    test_db.commit()
    configure_provider(monkeypatch, sub="disabled-subject", email=test_user.email,
                       email_verified=True)
    response = client.get("/auth/callback?code=valid", follow_redirects=False)
    assert "token" not in response.cookies
    assert response.headers["location"].startswith("/users/login?")


def test_new_verified_subject_can_sign_in(client, test_db, monkeypatch):
    configure_provider(monkeypatch, sub="new-subject", email="oauth-new@example.com",
                       email_verified=True, name="New User")
    response = client.get("/auth/callback?code=valid", follow_redirects=False)
    assert response.headers["location"] == "/users/dashboard"
    assert response.cookies.get("token")
    user = test_db.query(models.User).filter_by(google_id="new-subject").one()
    assert user.is_verified
    assert not crud.verify_password("attacker-password", user.hashed_password)
