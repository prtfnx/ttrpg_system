# Performance Benchmarks

This project includes a full-stack benchmark suite covering Rust WASM, Python server, and React frontend.

## Quick Start

```powershell
# Run ALL benchmarks (Rust + Python + Frontend)
.\scripts\bench.ps1

# Run via Turbo (per-package)
pnpm bench

# Run a single stack
.\scripts\bench.ps1 -Rust
.\scripts\bench.ps1 -Python
.\scripts\bench.ps1 -Web
```

## Per-Stack Commands

### Rust (Criterion.rs)

```powershell
cd packages/rust-core
cargo bench                              # full run with HTML reports
cargo bench -- --quick                   # fast check (fewer iterations)
cargo bench -- --save-baseline main      # save baseline
cargo bench -- --baseline main           # compare against baseline
```

**What it benchmarks:**
| Benchmark | What it measures | Why it matters |
|---|---|---|
| `line_blocked/N` | Spatial hash raycasting | Every movement check, LOS query |
| `find_path/N` | A* pathfinding | Movement validation, reachability |
| `rebuild_index/N` | Spatial hash construction | Triggered on wall/obstacle edits |

Reports are written to `packages/rust-core/target/criterion/` — open `report/index.html` in a browser.

### Python (pytest-benchmark)

```powershell
# Core pathfinding library
cd packages/core-table
pytest tests/bench_pathfinding.py --benchmark-only

# Server movement validator
cd apps/server
pytest tests/benchmarks/ --benchmark-only

# With baseline save/compare
pytest tests/bench_pathfinding.py --benchmark-only --benchmark-autosave
pytest tests/bench_pathfinding.py --benchmark-only --benchmark-compare
```

**What it benchmarks:**

| Benchmark | Package | What it measures |
|---|---|---|
| `spatial_hash_build[N]` | core-table | Hash construction cost |
| `line_blocked_walls[N]` | core-table | Wall collision via spatial hash |
| `line_blocked_obstacles[N]` | core-table | Obstacle collision via spatial hash |
| `find_path_astar[N]` | core-table | Server-side A* pathfinding |
| `reachable_cells[N]` | core-table | BFS flood-fill for movement range |
| `validate_full[N]` | server | Full movement validation pipeline |
| `validate_lightweight[N]` | server | Segment-only validation (fast tier) |

Baselines are saved in `.benchmarks/` directories (gitignored).

### Frontend (Vitest bench)

```powershell
cd apps/web-ui
pnpm bench
```

**What it benchmarks:**
| Benchmark | What it measures |
|---|---|
| `snapToCell` | Grid snapping (hot path in ghost preview) |
| `lastCell Map throttle` | Cache hit/miss for preview dedup |
| `distance calculations` | Euclidean, Manhattan, Chebyshev |

### WebSocket Load Test (Locust)

```powershell
# Requires a running server
pip install locust websocket-client
$env:LOAD_TEST_TOKEN = "your-jwt"
$env:LOAD_TEST_SESSION = "SESSION_CODE"
locust -f apps/server/tests/loadtest/locustfile.py --host http://localhost:8000
```

Opens a web UI at http://localhost:8089 for controlling user count and viewing live charts.

## Regression Detection

### Save a Baseline

```powershell
# Save current numbers as "main" baseline
.\scripts\bench.ps1 -Save

# This runs:
# - cargo bench -- --save-baseline main
# - pytest --benchmark-autosave
```

### Compare Against Baseline

```powershell
# After making changes, compare
.\scripts\bench.ps1 -Compare

# Criterion shows: "regressed by +12.3%" or "improved by -5.1%"
# pytest-benchmark shows a comparison table
```

### In CI (future)

```yaml
# Example GitHub Actions step
- name: Bench regression check
  run: |
    cargo bench --bench collision_bench -- --baseline main --save-baseline pr
    pytest tests/bench_pathfinding.py --benchmark-only --benchmark-compare-fail=mean:10%
```

The `--benchmark-compare-fail=mean:10%` flag fails the build if any benchmark regresses by more than 10%.

## File Layout

```
packages/rust-core/
  benches/
    collision_bench.rs          # Criterion benchmarks
  target/criterion/             # HTML reports (gitignored)
packages/core-table/
  tests/
    bench_pathfinding.py        # Pathfinding benchmarks
  .benchmarks/                  # Saved baselines (gitignored)
apps/server/
  tests/
    benchmarks/
      bench_movement.py         # Movement validator benchmarks
    loadtest/
      locustfile.py             # Locust WS load test
  .benchmarks/                  # Saved baselines (gitignored)
apps/web-ui/
  src/bench/
    planning.bench.ts           # Vitest benchmarks
scripts/
  bench.ps1                     # Full-stack orchestration
```

## Adding New Benchmarks

### Rust

1. Add a function to `benches/collision_bench.rs`
2. Register in `criterion_group!`
3. Run `cargo bench` to verify

### Python

1. Create `bench_*.py` in the test directory (or add to existing)
2. Use `benchmark` fixture: `def test_bench_foo(benchmark): benchmark(fn, args...)`
3. Use `@pytest.fixture(params=[...])` for parameterized sizes

### Frontend

1. Add `*.bench.ts` file in `src/bench/`
2. Use `bench('name', () => { ... })` from vitest
3. Run `pnpm bench`

## Interpreting Results

### What to look for

- **Mean time** — primary metric for comparison
- **StdDev** — high stddev means inconsistent performance (GC, contention)
- **Scaling** — does time grow linearly, quadratically with N? Compare across sizes
- **Outliers** — many outliers suggest system noise; rerun on quiet machine

### Thresholds (rules of thumb for this project)

| Operation | Target | Critical |
|---|---|---|
| `line_blocked` (Rust) | < 5μs | > 20μs |
| `find_path` (Rust) | < 500μs | > 2ms |
| `validate_lightweight` (Python) | < 100μs | > 500μs |
| `validate_full` (Python) | < 10ms | > 50ms |
| `snapToCell` (JS) | < 100ns | > 1μs |
