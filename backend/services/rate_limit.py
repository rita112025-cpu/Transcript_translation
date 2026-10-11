"""In-process sliding-window rate limiter.

Hits are kept per client key in memory, so counts reset when the backend restarts. This guards a
single local deployment against runaway uploads; it is not a substitute for a gateway in front of a
public service.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable

Clock = Callable[[], float]


class RateLimiter:
    def __init__(self, limits: list[tuple[int, float]], clock: Clock = time.monotonic) -> None:
        """``limits`` is a list of ``(max_hits, window_seconds)``. A ``max_hits`` of 0 disables that window."""
        self._limits = [(max_hits, window) for max_hits, window in limits if max_hits > 0]
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> float | None:
        """Record one hit for ``key``. Return None if allowed, otherwise seconds until a retry can succeed."""
        if not self._limits:
            return None
        now = self._clock()
        horizon = max(window for _, window in self._limits)
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= horizon:
                hits.popleft()

            retry_after = 0.0
            for max_hits, window in self._limits:
                recent = [stamp for stamp in hits if now - stamp < window]
                if len(recent) >= max_hits:
                    # The oldest hit that must expire before one more request fits in this window.
                    blocking = recent[len(recent) - max_hits]
                    retry_after = max(retry_after, blocking + window - now)

            if retry_after > 0:
                return retry_after
            hits.append(now)
            return None
