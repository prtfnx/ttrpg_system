import threading
from types import SimpleNamespace

import pytest
from database import models
from routers import auth
from starlette.responses import RedirectResponse

oauth = auth.oauth


@pytest.mark.integration
class TestOAuthGoogle:
    def test_first_login_moves_to_callback_host_before_setting_state(self, client, monkeypatch):
        started = []

        async def authorize_redirect(request, redirect_uri):
            started.append(redirect_uri)
            request.session["oauth_test_state"] = "browser-bound-state"
            return RedirectResponse("https://accounts.google.com/authorize", status_code=302)

        async def authorize_access_token(request):
            assert request.session.pop("oauth_test_state", None) == "browser-bound-state"
            return {"userinfo": {"sub": "first-login-subject", "email": "first@example.com",
                                 "email_verified": True, "name": "First Login"}}

        monkeypatch.setattr(auth, "OAUTH_CONFIGURED", True)
        monkeypatch.setattr(auth.settings, "BASE_URL", "http://localhost:12345")
        monkeypatch.setattr(auth, "oauth", SimpleNamespace(google=SimpleNamespace(
            authorize_redirect=authorize_redirect, authorize_access_token=authorize_access_token,
        )))

        response = client.get("http://127.0.0.1:12345/auth/google", follow_redirects=False)
        assert response.headers["location"] == "http://localhost:12345/auth/google"
        assert "session" not in response.cookies
        assert started == []

        response = client.get(response.headers["location"], follow_redirects=False)
        assert started == ["http://localhost:12345/auth/callback"]
        assert response.cookies.get("session")
        response = client.get("http://localhost:12345/auth/callback?code=accepted", follow_redirects=False)
        assert response.headers["location"] == "/users/dashboard"
        assert response.cookies.get("token")
        assert client.get("http://localhost:12345/users/dashboard").status_code == 200

    def test_tls_proxy_does_not_cause_redirect_loop(self, client, monkeypatch):
        async def authorize_redirect(_request, redirect_uri):
            assert redirect_uri == "https://example.com/auth/callback"
            return RedirectResponse("https://accounts.google.com/authorize", status_code=302)

        monkeypatch.setattr(auth, "OAUTH_CONFIGURED", True)
        monkeypatch.setattr(auth.settings, "BASE_URL", "https://example.com")
        monkeypatch.setattr(auth, "oauth", SimpleNamespace(google=SimpleNamespace(
            authorize_redirect=authorize_redirect,
        )))
        response = client.get("http://example.com/auth/google", follow_redirects=False)
        assert response.headers["location"] == "https://accounts.google.com/authorize"

    def test_login_page_explains_oauth_failure(self, client):
        response = client.get("/users/login?error=oauth_failed&reason=untrusted-text")
        assert "Google sign-in could not be completed" in response.text
        assert "untrusted-text" not in response.text

    def test_oauth_state_uses_signed_session_storage(self):
        assert oauth.cache is None

    def test_login_page_does_not_create_placeholder_session(self, client):
        response = client.get("/users/login", follow_redirects=False)
        assert response.status_code == 200
        assert "session" not in response.cookies

    def test_google_login_available(self, client):
        """Endpoint responds: redirects to Google or returns 503 if not configured"""
        response = client.get("/auth/google", follow_redirects=False)
        assert response.status_code in [302, 307, 503]

    def test_google_login_unconfigured_structure(self, client):
        """When unconfigured, 503 response has correct structure"""
        response = client.get("/auth/google", follow_redirects=False)
        if response.status_code == 503:
            data = response.json()
            assert "error" in data
            assert "message" in data
        else:
            # OAuth configured — expect redirect to Google
            assert response.status_code in [302, 307]
            location = response.headers.get("location", "")
            assert "google" in location or "accounts" in location or location


@pytest.mark.integration
class TestOAuthCallback:
    def test_callback_unconfigured(self, client):
        """Redirects to login when OAuth is not configured"""
        response = client.get("/auth/callback", follow_redirects=False)
        assert response.status_code in [302, 307]

    def test_callback_with_oauth_error(self, client):
        """Handles OAuth errors from Google gracefully"""
        response = client.get(
            "/auth/callback?error=access_denied",
            follow_redirects=False
        )
        assert response.status_code in [302, 307]

    def test_callback_no_code_redirects(self, client):
        """No auth code → handled gracefully with redirect"""
        response = client.get("/auth/callback", follow_redirects=False)
        assert response.status_code in [302, 307]

    def test_configured_callback_persists_identity_off_event_loop(
        self,
        client,
        test_db,
        test_user,
        monkeypatch,
    ):
        test_user.google_id = "google-identity-7"
        test_db.commit()
        threads = {}
        original_resolver = auth._resolve_oauth_identity

        async def authorize_access_token(_request):
            threads["provider"] = threading.get_ident()
            return {
                "userinfo": {
                    "sub": "google-identity-7",
                    "email": test_user.email,
                    "email_verified": True,
                    "name": "Test User",
                },
            }

        def resolve_in_worker(*args, **kwargs):
            threads["database"] = threading.get_ident()
            return original_resolver(*args, **kwargs)

        monkeypatch.setattr(auth, "OAUTH_CONFIGURED", True)
        monkeypatch.setattr(
            auth,
            "oauth",
            SimpleNamespace(
                google=SimpleNamespace(authorize_access_token=authorize_access_token),
            ),
        )
        monkeypatch.setattr(auth, "_resolve_oauth_identity", resolve_in_worker)

        response = client.get("/auth/callback?code=accepted", follow_redirects=False)

        assert response.status_code == 302
        assert response.headers["location"] == "/users/dashboard"
        assert response.cookies.get("token")
        assert threads["database"] != threads["provider"]

        test_db.expire_all()
        linked_user = test_db.query(models.User).filter_by(id=test_user.id).one()
        assert linked_user.google_id == "google-identity-7"
        audit = test_db.query(models.AuditLog).filter_by(
            action="authentication.oauth",
            outcome="success",
            user_id=test_user.id,
        ).one()
        assert "google" in audit.details_json

    def test_configured_provider_rejection_persists_failure_audit(
        self,
        client,
        test_db,
        monkeypatch,
    ):
        monkeypatch.setattr(auth, "OAUTH_CONFIGURED", True)

        response = client.get(
            "/auth/callback?error=access_denied",
            follow_redirects=False,
        )

        assert response.status_code == 302
        audit = test_db.query(models.AuditLog).filter_by(
            action="authentication.oauth",
            outcome="failure",
        ).one()
        assert "provider_error" in audit.details_json
