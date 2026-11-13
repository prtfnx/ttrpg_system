"""Login returns to a bounded local destination and keeps it through failures."""
import pytest
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
