# Performance Benchmark Report

**Date:** 2026-04-13  
**Branch:** `feat/performance-benchmarks`  
**System:** Windows, Rust 2024 edition, Python 3.10, Node 22 / Vitest 4.1.3  

---

## Executive Summary

Full-stack performance analysis across Rust WASM, Python server, and React frontend identified **3 critical bottlenecks** requiring immediate attention and **4 moderate issues** worth monitoring. The render loop is fast at small scales but degrades predictably at production loads (200+ sprites). The Python protocol layer has a JSON anti-pattern causing 23x overhead. The frontend store pattern shows linear scaling but stays within budget at typical loads.

### Severity Rating

| Rating | Meaning | Threshold |
|--------|---------|-----------|
| CRITICAL | Exceeds frame/request budget | > 5ms per operation |
| WARNING | Approaches budget at scale | 1–5ms, linear growth |
| OK | Well within budget | < 1ms, stable |
| FAST | Negligible overhead | < 10μs |

---

## 1. Rust WASM (Render Engine)

### 1.1 Collision System

| Benchmark | N=10 | N=50 | N=200 | Verdict |
|-----------|------|------|-------|---------|
| `line_blocked` | 1.3μs | 1.4μs | 1.5μs | **OK** — flat scaling, O(wall_count) |
| `find_path` (A*) | 136μs | 213μs | 218μs | **OK** — plateaus at 50+, excellent |
| `rebuild_index` | 17.6μs | 102μs | 350μs | **WARNING** — linear, but only on map change |

**Analysis:** Pathfinding is well-optimized. The spatial hash rebuild at 200 walls (350μs) is acceptable since it only triggers on wall edits, not per-frame. Line-blocked checks are sub-2μs regardless of wall count.

### 1.2 Render Bottlenecks

| Benchmark | Result | Comparison | Verdict |
|-----------|--------|------------|---------|
| **grid_vertex_gen** (1080p, alloc) | 1.2μs | — | OK per-frame |
| **grid_vertex_gen** (4K, alloc) | 1.3μs | — | OK per-frame |
| **grid_vertex_gen** (4K, prealloc) | 643ns | **2x faster** | Easy win |
| **sprite_lookup** @20 sprites | 117ns | — | FAST |
| **sprite_lookup** @100 sprites | 139ns | — | FAST |
| **sprite_lookup** @500 sprites | 1.17μs | **10x from 20** | WARNING at scale |
| **table_id_filter** @1000 (string eq) | 3.3μs | — | WARNING |
| **table_id_filter** @1000 (byte prefix) | 770ns | **4.3x faster** | CRITICAL fix available |
| **polygon_line_verts** @20 verts | 65ns | — | FAST, deprioritize |
| **sprite_serde** (serialize) | 1.04μs | — | OK |
| **sprite_serde** (deserialize) | 796ns | — | OK |

#### CRITICAL: String table_id comparison in render loop

The render loop filters sprites by `table_id` using full string equality on every frame. At 1000 sprites, this costs **3.3μs per frame** — manageable alone, but this runs inside the hot render path alongside other operations. Switching to integer IDs or byte-prefix comparison yields a **4.3x speedup** to 770ns.

**Recommendation:** Replace `String` table_id with `u32` or use a pre-computed hash for table filtering in the render loop.

#### WARNING: Sprite lookup linear scaling

Sprite lookup (layer sort + search) scales linearly from 117ns @20 to 1.17μs @500. This is per-mouse-event, not per-frame, so it's acceptable at typical VTT sizes (20–100 sprites). Monitor if sprite counts exceed 200.

#### Easy Win: Grid vertex preallocation

Preallocating the grid vertex buffer instead of allocating per-frame saves ~50% (1.3μs → 643ns at 4K). Trivial to implement.

---

## 2. Python Server

### 2.1 Core Pathfinding (core-table)

| Benchmark | N=10 | N=50 | N=200 | Verdict |
|-----------|------|------|-------|---------|
| `line_blocked` (obstacles) | 8.0μs | 9.3μs | 9.3μs | **OK** — flat |
| `line_blocked` (walls) | 9.3μs | 9.0μs | 9.0μs | **OK** — flat |
| `spatial_hash_build` | 51μs | 252μs | 1.03ms | **WARNING** — on map change only |
| `find_path_astar` | 1.79ms | 1.88ms | 2.04ms | **WARNING** — stable but expensive |
| `reachable_cells` | 707μs | 700μs | 704μs | **OK** — flat |

**Analysis:** Python pathfinding is ~10x slower than Rust WASM (1.8ms vs 136μs for A*), as expected. This runs server-side for validation only, so 2ms per path is acceptable. The spatial hash rebuild at 1ms/200 entities only triggers on entity add/remove.

### 2.2 Movement Validation

| Benchmark | N=10 | N=50 | N=200 | Verdict |
|-----------|------|------|-------|---------|
| `validate_lightweight` | 61μs | 314μs | 1.37ms | **WARNING** — linear |
| `validate_full` | 7.3ms | 8.1ms | 8.6ms | **CRITICAL** — >5ms always |

**Analysis:** Full movement validation takes **7–8.6ms** regardless of entity count, dominated by A* pathfinding. At 200 entities, even lightweight validation reaches 1.37ms. For real-time movement, consider:
- Caching valid paths for repeat moves
- Deferring full validation to end-of-turn

### 2.3 Protocol Bottlenecks

| Benchmark | Mean | vs Baseline | Verdict |
|-----------|------|-------------|---------|
| **json_roundtrip** (20 msgs) | 155.9μs | **23x slower than direct** | CRITICAL anti-pattern |
| **json_direct_dict** (20 msgs) | 6.8μs | baseline | — |
| `message_parse` (single) | 5.0μs | — | OK |
| `message_serialize` (single) | 4.3μs | — | OK |
| `controlled_by_loads` (single) | 1.6μs | — | FAST |
| `controlled_by_roundtrip` (50 items) | 77.9μs | — | WARNING at batch |
| `broadcast_filter` (50 clients) | 3.1μs | — | FAST |
| `dict_dispatch` | 156ns | — | FAST |

#### CRITICAL: JSON round-trip anti-pattern

`server_protocol.py:267` calls `json.loads(resp.to_json())` — serializing a Message to JSON string then immediately parsing it back to a dict. This costs **155.9μs for 20 messages** vs **6.8μs** for direct dict construction. That's a **23x overhead** with zero benefit.

**Recommendation:** Replace `json.loads(msg.to_json())` with direct dict access: `{"type": msg.type.value, "data": msg.data, ...}`. This eliminates the serialize→deserialize cycle entirely.

#### WARNING: controlled_by batch decoding

Loading 50 sprites each with `json.loads(controlled_by)` costs **78μs**. For session load with 200+ sprites, this adds ~300μs. Not critical but worth noting.

---

## 3. React Frontend (Web UI)

### 3.1 Store State Updates

| Benchmark | N | ops/sec | mean | Verdict |
|-----------|---|---------|------|---------|
| **updateSprite spread** | 10 | 5.7M | 0.2μs | FAST |
| **updateSprite spread** | 50 | 2.4M | 0.4μs | OK |
| **updateSprite spread** | 100 | 1.3M | 0.8μs | OK |
| **updateSprite spread** | 500 | 319K | 3.1μs | WARNING |
| **combatStore spread** | 5 | 5.8M | 0.2μs | FAST |
| **combatStore spread** | 10 | 4.9M | 0.2μs | FAST |
| **combatStore spread** | 20 | 4.4M | 0.2μs | FAST |
| **combatStore spread** | 50 | 2.3M | 0.4μs | OK |

**Scaling factor:** 500 sprites is **18x slower** than 10 sprites (linear O(N) map).

**Analysis:** The `updateSprite` pattern (`.map(s => s.id === id ? {...s, ...updates} : s)`) is the hottest path — every sprite movement triggers a full array spread. At typical VTT loads (50–100 sprites), this costs 0.4–0.8μs per update, which is well within the 16ms frame budget. 

At 500 sprites (3.1μs), it's still fast as a single operation, but consider that multiple sprite updates per frame (5–10 during movement) compound to 15–30μs. Still sub-millisecond.

The **combatStore triple-nested spread** (2.5x slower at 50 combatants) is acceptable since combat rarely exceeds 20 participants.

**Recommendation:** No action needed at current scale. If sprite counts routinely exceed 200, consider a Map-based store or `immer` for targeted updates.

### 3.2 Message Dispatch

| Benchmark | Mean | Verdict |
|-----------|------|---------|
| batch of 5 | 0.1μs | FAST |
| batch of 15 | 0.2μs | FAST |
| batch of 30 | 0.4μs | FAST |

**Analysis:** Handler Map lookup + dispatch is negligible. The dispatch itself is not the bottleneck — the state updates triggered by each handler are (see 3.1).

### 3.3 Event System

| Benchmark | Mean | Verdict |
|-----------|------|---------|
| 1 handler | 52ns | FAST |
| 5 handlers | 59ns | FAST |
| 10 handlers | 68ns | FAST |
| 20 handlers | 87ns | FAST |

**Analysis:** Event emit is sub-100ns even at 20 handlers. The sequential execution pattern is not a bottleneck.

### 3.4 Equipment List

| Benchmark | Mean | Verdict |
|-----------|------|---------|
| 50 items | 0.2μs | FAST |
| 200 items | 0.7μs | OK |
| 500 items | 2.0μs | OK |

**Analysis:** The filter+map operation itself is fast. The real cost is DOM rendering of 500 unvirtualized items, which this benchmark doesn't capture (would need browser rendering benchmarks). The data processing is not the bottleneck — React reconciliation and DOM layout are. Consider `react-virtual` for lists > 100 items.

### 3.5 Planning Utilities

| Benchmark | Mean | Verdict |
|-----------|------|---------|
| snapToCell (64px) | 51ns | FAST |
| snapToCell (32px) | 51ns | FAST |
| cache hit (throttle) | 62ns | FAST |
| cache miss | 751ns | FAST |
| euclidean distance | 52ns | FAST |
| manhattan distance | 51ns | FAST |
| chebyshev distance | 51ns | FAST |

**Analysis:** All planning utilities are sub-microsecond. No concerns.

---

## Priority Action Items

### CRITICAL (fix now)

1. **Protocol JSON round-trip** — Replace `json.loads(msg.to_json())` with direct dict construction in `server_protocol.py`. **23x overhead, zero benefit.**

2. **Full movement validation** — 7–8.6ms per validation exceeds the 5ms target. Cache valid paths or defer to end-of-turn for real-time movement.

3. **Rust table_id string comparison** — Switch render-loop table_id filtering from `String` equality to integer/hash comparison. **4.3x free speedup.**

### WARNING (monitor)

4. **Sprite lookup at 500+** — Linear O(N×M) scaling. Monitor sprite counts; switch to HashMap lookup if >200 sprites become common.

5. **Spatial hash rebuild** — 350μs Rust / 1ms Python at 200 entities. Only on map change, but could spike during batch operations.

6. **Lightweight movement validation** — 1.37ms at 200 entities. Linear scaling, fine for now.

7. **controlled_by JSON per-sprite** — 78μs for 50 sprites. Store as native list instead of JSON string.

### OK (no action needed)

- Grid vertex generation (1.2μs/frame)
- Sprite serde (~1μs)  
- Frontend store spreads at typical loads (<100 sprites)
- WS batch dispatch (<0.4μs)
- Event system emit (<87ns)
- All planning utilities (<1μs)

---

## Benchmark File Inventory

| Stack | File | Tests | Framework |
|-------|------|-------|-----------|
| Rust | `benches/collision_bench.rs` | 9 | Criterion 0.5 |
| Rust | `benches/bottleneck_bench.rs` | 17 | Criterion 0.5 |
| Python | `core-table/tests/bench_pathfinding.py` | 15 | pytest-benchmark |
| Python | `core-table/tests/bench_bottlenecks.py` | 8 | pytest-benchmark |
| Python | `server/tests/benchmarks/bench_movement.py` | 6 | pytest-benchmark |
| Frontend | `web-ui/src/bench/planning.bench.ts` | 7 | Vitest bench |
| Frontend | `web-ui/src/bench/bottleneck.bench.ts` | 22 | Vitest bench |
| Load | `server/tests/loadtest/locustfile.py` | — | Locust |
| **Total** | | **84** | |

---

## How to Reproduce

```bash
# Rust benchmarks
cd packages/rust-core && cargo bench

# Python benchmarks  
python -m pytest packages/core-table/tests/bench_*.py --benchmark-only
python -m pytest apps/server/tests/benchmarks/ --benchmark-only

# Frontend benchmarks
cd apps/web-ui && npx vitest bench --project jsdom

# Full suite
.\scripts\bench.ps1
```

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for detailed usage guide.
