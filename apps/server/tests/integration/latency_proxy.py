"""Bounded WebSocket relay with independently delayed, ordered directions."""
import asyncio
import threading
import time
from concurrent.futures import Future
from contextlib import contextmanager

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve


async def forward(source, target, delay):
    queue = asyncio.Queue(maxsize=64)

    async def receive():
        async for payload in source:
            await queue.put((time.monotonic() + delay, payload))
        await queue.put(None)

    async def deliver():
        while (item := await queue.get()) is not None:
            due, payload = item
            await asyncio.sleep(max(0, due - time.monotonic()))
            await target.send(payload)

    tasks = [asyncio.create_task(receive()), asyncio.create_task(deliver())]
    try:
        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@contextmanager
def delayed_websocket_proxy(upstream, *, one_way_delay=0.05):
    """Delay frame arrival without adding one sleep per queued frame to RTT."""
    ready, stop, failures = Future(), threading.Event(), []

    async def handler(client):
        request = client.request
        async with connect(upstream, proxy=None, origin=request.headers.get("Origin"),
                additional_headers={"Cookie": request.headers.get("Cookie", "")},
                max_size=2 * 1024 * 1024, max_queue=16, ping_interval=None) as server:
            tasks = [asyncio.create_task(forward(client, server, one_way_delay)),
                asyncio.create_task(forward(server, client, one_way_delay))]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

    async def run():
        async with serve(handler, "127.0.0.1", 0, max_size=2 * 1024 * 1024, max_queue=16,
                ping_interval=None) as server:
            ready.set_result(server.sockets[0].getsockname()[1])
            await asyncio.to_thread(stop.wait)

    def worker():
        try:
            asyncio.run(run())
        except Exception as error:
            if not ready.done():
                ready.set_exception(error)
            else:
                failures.append(error)

    thread = threading.Thread(target=worker, name="test-latency-proxy", daemon=True)
    thread.start()
    try:
        yield ready.result(timeout=10)
    finally:
        stop.set()
        thread.join(timeout=10)
        assert not thread.is_alive(), "Latency proxy did not stop"
        if failures:
            raise failures[0]
