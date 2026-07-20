"""Safe SQLAlchemy database URL normalization."""

from sqlalchemy.engine import URL, make_url


def normalize_database_url(raw_database_url: str | URL) -> URL:
    """Return a SQLAlchemy URL using Psycopg 3 for provider PostgreSQL URLs."""
    url = make_url(raw_database_url)
    if url.drivername == "postgresql":
        return url.set(drivername="postgresql+psycopg")
    return url
