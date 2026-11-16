"""Login returns to a bounded local destination and keeps it through failures."""
import pytest
from authlib.integrations.starlette_client import OAuthError
from starlette.responses import RedirectResponse
from utils.login_return import login_return_path


@pytest.mark.parametrize('target', ['/game/session/ROOM12', '/invite/invite-code_7', '/users/dashboard'])
def test_supported_login_destination(target):
    assert login_return_path(target) == target


@pytest.mark.parametrize('target', [None, 7, '', 'https://evil.example', '//evil.example',
    '/\\evil.example', '/game/session/../admin', '/game/session/%2f%2fevil',
    '/game/session/ROOM?next=//evil.example', '/game/session/ROOM#fragment',
    '/game/session/ROOM\n', '/game/session/' + 'X' * 129, '/users/logout'])
def test_unsupported_login_destination(target):
    assert login_return_path(target) is None


@pytest.mark.parametrize('target', ['/game/session/ROOM12', '/invite/invite-code_7', '//evil.example'])
def test_password_login_checks_destination_and_sets_a_fresh_cookie(client, test_user, target):
    response = client.post('/users/login', data={
        'username': test_user.username, 'password': 'Pass1234', 'next_url': target,
    }, follow_redirects=False)
    assert response.status_code == 302
    assert response.headers['location'] == (target if login_return_path(target) else '/users/dashboard')
    assert response.cookies.get('token')


def test_login_form_and_failed_attempt_retain_only_the_safe_destination(client, test_user):
    target = '/game/session/ROOM12'
    form = client.get('/users/login', params={'next': target})
    assert f'name="next_url" value="{target}"' in form.text
    assert 'href="/auth/google?next=/game/session/ROOM12"' in form.text
    failed = client.post('/users/login', data={
        'username': test_user.username, 'password': 'WrongPass1', 'next_url': target,
    })
    assert failed.status_code == 401
    assert f'name="next_url" value="{target}"' in failed.text
    assert 'WrongPass1' not in failed.text
    assert 'name="next_url"' not in client.get('/users/login', params={'next': '//evil.example'}).text


def test_login_rate_limit_preserves_the_return_destination(client, monkeypatch):
    from routers import users
    monkeypatch.setattr(users.login_limiter, 'is_allowed', lambda *_args, **_kwargs: False)
    response = client.post('/users/login', data={
        'username': 'owner', 'password': 'Pass1234', 'next_url': '/game/session/ROOM12',
    })
    assert response.status_code == 429
    assert 'name="next_url" value="/game/session/ROOM12"' in response.text


@pytest.fixture
def returning_google(monkeypatch, test_user, test_db):
    from types import SimpleNamespace

    from routers import auth
    test_user.google_id = 'returning-google-subject'
    test_db.commit()
    started = []

    async def authorize_redirect(request, _redirect_uri):
        state = f'flow-{len(started)}'
        started.append(state)
        request.session[f'test-oauth-{state}'] = True
        return RedirectResponse(f'https://accounts.google.com/authorize?state={state}', status_code=302)

    async def authorize_access_token(request):
        state = request.query_params.get('state')
        if not request.session.pop(f'test-oauth-{state}', None):
            raise OAuthError(error='invalid_state')
        return {'userinfo': {'sub': test_user.google_id, 'email': test_user.email, 'email_verified': True}}

    monkeypatch.setattr(auth, 'OAUTH_CONFIGURED', True)
    monkeypatch.setattr(auth.settings, 'BASE_URL', 'http://testserver')
    monkeypatch.setattr(auth, 'oauth', SimpleNamespace(google=SimpleNamespace(
        authorize_redirect=authorize_redirect, authorize_access_token=authorize_access_token)))
    return started


def test_google_destinations_are_bound_to_each_flow_and_not_callback_query(client, returning_google):
    for target in ('/game/session/FIRST', '/game/session/SECOND'):
        response = client.get('/auth/google', params={'next': target}, follow_redirects=False)
        assert response.status_code == 302
    for state, target in zip(returning_google, ('FIRST', 'SECOND')):
        response = client.get('/auth/callback', params={'code': 'accepted', 'state': state,
            'next': '//evil.example'}, follow_redirects=False)
        assert response.headers['location'] == f'/game/session/{target}'
        assert response.cookies.get('token')


def test_google_failure_keeps_the_validated_destination_for_deliberate_retry(client, returning_google):
    from urllib.parse import parse_qs, urlsplit
    client.get('/auth/google', params={'next': '/game/session/ROOM12'}, follow_redirects=False)
    response = client.get('/auth/callback', params={'state': returning_google[0], 'error': 'access_denied'},
        follow_redirects=False)
    assert 'token' not in response.cookies
    assert parse_qs(urlsplit(response.headers['location']).query)['next'] == ['/game/session/ROOM12']


def test_google_rejects_external_destinations_and_unverified_state(client, returning_google):
    client.get('/auth/google', params={'next': '//evil.example'}, follow_redirects=False)
    response = client.get('/auth/callback', params={'code': 'accepted', 'state': returning_google[0]},
        follow_redirects=False)
    assert response.headers['location'] == '/users/dashboard'
    client.get('/auth/google', params={'next': '/game/session/ROOM12'}, follow_redirects=False)
    response = client.get('/auth/callback', params={'code': 'accepted', 'state': 'forged'}, follow_redirects=False)
    assert 'token' not in response.cookies and response.headers['location'].startswith('/users/login?')


def test_google_host_correction_retains_the_safe_destination(client, returning_google, monkeypatch):
    from routers import auth
    monkeypatch.setattr(auth.settings, 'BASE_URL', 'http://localhost:12345')
    response = client.get('http://127.0.0.1:12345/auth/google',
        params={'next': '/game/session/ROOM12'}, follow_redirects=False)
    assert response.headers['location'] == 'http://localhost:12345/auth/google?next=%2Fgame%2Fsession%2FROOM12'
    assert not returning_google and 'session' not in response.cookies


def test_google_return_state_is_bounded_and_an_evicted_target_cannot_leak(client, returning_google):
    for index in range(4):
        client.get('/auth/google', params={'next': f'/game/session/ROOM{index}'}, follow_redirects=False)
    response = client.get('/auth/callback', params={'state': returning_google[0], 'code': 'accepted'},
        follow_redirects=False)
    assert response.headers['location'] == '/users/dashboard'
