"""Bounded admission control for synchronous work called by async handlers."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import ParamSpec, TypeVar
from weakref import WeakKeyDictionary

from config import Settings

P = ParamSpec("P")
R = TypeVar("R")


class BlockingWorkerLimiter:
    """Keep blocking calls off-loop without growing the executor queue freely."""

    def __init__(self, max_concurrency: int) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be positive")
        self._max_concurrency = max_concurrency
        self._semaphores: WeakKeyDictionary[
            asyncio.AbstractEventLoop,
            asyncio.Semaphore,
        ] = WeakKeyDictionary()

    def _semaphore(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        semaphore = self._semaphores.get(loop)
        if semaphore is None:
            semaphore = asyncio.Semaphore(self._max_concurrency)
            self._semaphores[loop] = semaphore
        return semaphore

    async def run(
        self,
        func: Callable[P, R],
        /,
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> R:
        """Wait for capacity, then run one callable in asyncio's worker pool."""
        semaphore = self._semaphore()
        await semaphore.acquire()
        worker = asyncio.create_task(asyncio.to_thread(func, *args, **kwargs))

        def release_cancelled_worker(completed: asyncio.Task[R]) -> None:
            """Observe a detached worker's result and release its capacity."""
            try:
                completed.exception()
            except asyncio.CancelledError:
                pass
            finally:
                semaphore.release()

        try:
            result = await asyncio.shield(worker)
        except asyncio.CancelledError:
            if worker.done():
                release_cancelled_worker(worker)
            else:
                worker.add_done_callback(release_cancelled_worker)
            raise
        except BaseException:
            semaphore.release()
            raise
        else:
            semaphore.release()
            return result


_blocking_workers = BlockingWorkerLimiter(Settings().BLOCKING_WORKER_CONCURRENCY)


async def run_blocking(
    func: Callable[P, R],
    /,
    *args: P.args,
    **kwargs: P.kwargs,
) -> R:
    """Run blocking I/O under the process-wide async admission limit."""
    return await _blocking_workers.run(func, *args, **kwargs)
