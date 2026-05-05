"""Benchmarks targeting real server performance bottlenecks."""
import json
from types import SimpleNamespace

from core_table.protocol import Message, MessageType

# ── BOTTLENECK 1: JSON round-trip in batch handler ──
# server_protocol.py:267  json.loads(resp.to_json())

def _make_messages(n):
    return [
        Message(
            type=MessageType.SPRITE_MOVE,
            data={"sprite_id": f"s{i}", "x": i * 64.0, "y": i * 32.0, "table_id": "t1"},
            client_id="client_1",
        )
        for i in range(n)
    ]


def test_bench_json_roundtrip(benchmark):
    """Measures the anti-pattern: json.loads(msg.to_json()) per response."""
    msgs = _make_messages(20)

    def roundtrip():
        return [json.loads(m.to_json()) for m in msgs]

    benchmark(roundtrip)


def test_bench_json_direct_dict(benchmark):
    """Better approach: build dict directly without serialize→deserialize."""
    msgs = _make_messages(20)

    def direct():
        return [
            {
                "type": m.type.value,
                "data": m.data or {},
                "client_id": m.client_id,
                "timestamp": m.timestamp,
            }
            for m in msgs
        ]

    benchmark(direct)


# ── BOTTLENECK 2: Message parse + dispatch overhead ──
# Every WS message is json.loads → Message.from_json → dispatch

def test_bench_message_parse(benchmark):
    """Cost of parsing a single WS message from raw JSON string."""
    msg = Message(
        type=MessageType.SPRITE_MOVE,
        data={"sprite_id": "s1", "x": 100.0, "y": 200.0, "table_id": "t1"},
        client_id="client_1",
    )
    raw = msg.to_json()
    benchmark(Message.from_json, raw)


def test_bench_message_serialize(benchmark):
    """Cost of serializing a message for broadcast."""
    msg = Message(
        type=MessageType.SPRITE_MOVE,
        data={"sprite_id": "s1", "x": 100.0, "y": 200.0, "table_id": "t1"},
        client_id="client_1",
    )
    benchmark(msg.to_json)


# ── BOTTLENECK 3: controlled_by JSON encode/decode per sprite ──
# server_protocol.py:325,348,1212 - repeatedly json.loads/dumps controlled_by

def test_bench_controlled_by_loads(benchmark):
    """json.loads on controlled_by field (called per-sprite on load)."""
    data = json.dumps([1, 2, 3])
    benchmark(json.loads, data)


def test_bench_controlled_by_roundtrip_batch(benchmark):
    """Simulates loading 50 sprites each with controlled_by JSON."""
    entries = [json.dumps([i, i + 1]) for i in range(50)]

    def batch():
        return [json.loads(e) for e in entries]

    benchmark(batch)


# ── BOTTLENECK 4: Broadcast to N clients (dict lookup + filtering) ──

def test_bench_broadcast_filter(benchmark):
    """Simulates filtering clients for broadcast (visible layers check)."""
    clients = {f"client_{i}": SimpleNamespace(role="player" if i % 5 else "dm") for i in range(50)}
    visible = {"tokens", "map", "effects"}

    def filter_clients():
        return [
            cid for cid, info in clients.items()
            if info.role == "dm" or "tokens" in visible
        ]

    benchmark(filter_clients)


# ── BOTTLENECK 5: Dict handler dispatch vs if/elif ──

def _handle_move(data):
    return data

def _handle_chat(data):
    return data

def _handle_ping(data):
    return data

HANDLERS = {
    "sprite_move": _handle_move,
    "chat": _handle_chat,
    "ping": _handle_ping,
}

def test_bench_dict_dispatch(benchmark):
    """Dict-based message dispatch (current pattern)."""
    def dispatch():
        handler = HANDLERS.get("sprite_move")
        if handler:
            return handler({"x": 1})

    benchmark(dispatch)
