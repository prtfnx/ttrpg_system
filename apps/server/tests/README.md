# Server Test Suite

FastAPI test suite following best practices.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run all tests
pytest

# Run specific test type
pytest -m unit
pytest -m integration

# Run with coverage
pytest --cov=server_host --cov-report=html

# Run specific test file
pytest tests/integration/test_game_routes.py
```

## Structure

```
tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Unit tests (fast, isolated)
├── integration/             # Integration tests (real scenarios)
├── utils/                   # Test utilities
└── legacy/                  # Old tests (being phased out)
```

## Key Fixtures

- `client` - TestClient with test database
- `auth_client` - Authenticated test client
- `test_user` - Pre-created test user
- `test_game_session` - Pre-created game session

## Writing Tests

```python
import pytest

@pytest.mark.integration
class TestMyFeature:
    def test_something(self, auth_client):
        response = auth_client.get("/endpoint")
        assert response.status_code == 200
```

## Coverage Goals

- Unit tests: 80%+
- Integration tests: Critical paths covered
- Fast execution: < 1 minute total
