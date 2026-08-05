"""UTC clock helpers for the server's database timestamp convention."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time in the database's naive UTC representation."""
    return datetime.now(UTC).replace(tzinfo=None)
