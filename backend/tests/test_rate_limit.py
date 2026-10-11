from __future__ import annotations

import pytest

from backend.services.rate_limit import RateLimiter


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_limit_then_reports_retry_after() -> None:
    clock = _Clock()
    limiter = RateLimiter([(3, 60)], clock=clock)

    assert [limiter.check("ip") for _ in range(3)] == [None, None, None]
    retry = limiter.check("ip")

    assert retry == pytest.approx(60)


def test_window_reopens_as_old_hits_expire() -> None:
    clock = _Clock()
    limiter = RateLimiter([(2, 60)], clock=clock)
    assert limiter.check("ip") is None
    clock.now += 30
    assert limiter.check("ip") is None

    clock.now += 31  # first hit is now 61s old
    assert limiter.check("ip") is None
    assert limiter.check("ip") == pytest.approx(29)


def test_rejected_attempts_do_not_extend_the_block() -> None:
    clock = _Clock()
    limiter = RateLimiter([(1, 60)], clock=clock)
    assert limiter.check("ip") is None
    clock.now += 30
    assert limiter.check("ip") == pytest.approx(30)
    clock.now += 30
    assert limiter.check("ip") is None


def test_hourly_limit_applies_even_when_minute_window_is_clear() -> None:
    clock = _Clock()
    limiter = RateLimiter([(10, 60), (2, 3600)], clock=clock)
    assert limiter.check("ip") is None
    clock.now += 120
    assert limiter.check("ip") is None

    clock.now += 120
    assert limiter.check("ip") == pytest.approx(3600 - 240)


def test_clients_are_counted_separately() -> None:
    limiter = RateLimiter([(1, 60)], clock=_Clock())
    assert limiter.check("a") is None
    assert limiter.check("b") is None
    assert limiter.check("a") is not None


def test_zero_limit_disables_the_limiter() -> None:
    limiter = RateLimiter([(0, 60)], clock=_Clock())
    assert all(limiter.check("ip") is None for _ in range(100))
