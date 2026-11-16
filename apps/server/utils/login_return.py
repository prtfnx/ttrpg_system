"""Closed, local navigation targets after account authentication."""
import re
from urllib.parse import urlencode


def login_return_path(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == '/users/dashboard':
        return value
    if re.fullmatch(r'/(?:game/session|invite)/[A-Za-z0-9_-]{1,128}', value):
        return value
    return None


def login_page_url(target: object = None, **parameters: str) -> str:
    destination = login_return_path(target)
    if destination:
        parameters['next'] = destination
    return '/users/login' + ('?' + urlencode(parameters) if parameters else '')
