# Server tests

Run from `apps/server` after installing `requirements.txt`,
`requirements-dev.txt`, and the editable `packages/core-table` package in the
same Python environment.

```powershell
python -m pytest tests/unit tests/integration
python -m pytest tests/unit/test_combat_action_authority.py -q --no-cov
```

`pyproject.toml` owns pytest and coverage configuration. Database-dependent
checks require their configured database; SQLite does not establish PostgreSQL
concurrency or fencing behavior.

See [Testing strategy](../../../docs/current/TESTING_STRATEGY.md) and
[Development](../../../docs/current/DEVELOPMENT.md) for current commands,
fixtures, environment setup, coverage and test boundaries.
