import asyncio
import threading
import time

import pytest
from utils.blocking import BlockingWorkerLimiter


@pytest.mark.unit
async def test_worker_limiter_bounds_concurrent_executor_submissions():
    limiter = BlockingWorkerLimiter(2)
    release = threading.Event()
    state_lock = threading.Lock()
    active = 0
    maximum = 0

    def blocked(value: int) -> int:
        nonlocal active, maximum
        with state_lock:
            active += 1
            maximum = max(maximum, active)
        try:
            assert release.wait(timeout=2)
            return value
        finally:
            with state_lock:
                active -= 1

    tasks = [asyncio.create_task(limiter.run(blocked, value)) for value in range(6)]
    deadline = time.monotonic() + 1
    while maximum < 2 and time.monotonic() < deadline:
        await asyncio.sleep(0.005)

    assert maximum == 2
    release.set()
    assert await asyncio.gather(*tasks) == list(range(6))
    assert maximum == 2


@pytest.mark.unit
async def test_cancelled_waiter_does_not_consume_capacity():
    limiter = BlockingWorkerLimiter(1)
    started = threading.Event()
    release = threading.Event()

    def blocked() -> None:
        started.set()
        assert release.wait(timeout=2)

    first = asyncio.create_task(limiter.run(blocked))
    deadline = time.monotonic() + 1
    while not started.is_set() and time.monotonic() < deadline:
        await asyncio.sleep(0.005)

    waiting = asyncio.create_task(limiter.run(lambda: "cancelled"))
    await asyncio.sleep(0)
    waiting.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiting

    release.set()
    await first
    assert await limiter.run(lambda: "available") == "available"


@pytest.mark.unit
async def test_cancelled_running_call_holds_capacity_until_worker_finishes():
    limiter = BlockingWorkerLimiter(1)
    started = threading.Event()
    release = threading.Event()
    replacement_started = threading.Event()

    def blocked() -> None:
        started.set()
        assert release.wait(timeout=2)

    running = asyncio.create_task(limiter.run(blocked))
    deadline = time.monotonic() + 1
    while not started.is_set() and time.monotonic() < deadline:
        await asyncio.sleep(0.005)

    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await running

    replacement = asyncio.create_task(
        limiter.run(lambda: replacement_started.set())
    )
    await asyncio.sleep(0.02)
    assert not replacement_started.is_set()

    release.set()
    await replacement
    assert replacement_started.is_set()
