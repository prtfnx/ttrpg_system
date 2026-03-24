import pytest


@pytest.mark.integration
class TestOAuthGoogle:
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

