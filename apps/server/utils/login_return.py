"""Closed, local navigation targets after account authentication."""
import re


def login_return_path(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    if value == '/users/dashboard':
        return value
    if re.fullmatch(r'/(?:game/session|invite)/[A-Za-z0-9_-]{1,128}', value):
        return value
    return None
