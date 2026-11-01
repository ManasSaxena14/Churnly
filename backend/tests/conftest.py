import pytest

from app import config


@pytest.fixture(autouse=True)
def _no_rate_limit_wait(monkeypatch):
    """Tests simulate rate limits; they must never really wait for them."""
    monkeypatch.setattr(config, "RATE_LIMIT_WAIT_S", 0.0)
