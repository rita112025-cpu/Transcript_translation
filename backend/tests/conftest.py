"""Test isolation: never use real credentials and never reach NVIDIA from the test suite.

The variables below are overwritten in this pytest process only. Windows user or system
environment variables are not modified. Because they are set (even to empty), ``load_dotenv``
will not re-import a key from the project ``.env`` during tests either.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
import riva.client as riva_client

os.environ["ENABLE_NVIDIA_CLOUD"] = "false"
os.environ["NVIDIA_API_KEY"] = ""
os.environ["NVIDIA_GRPC_SERVER"] = "grpc.nvcf.nvidia.com:443"
os.environ["NVIDIA_GRPC_FUNCTION_ID"] = "8473f56d-51ef-473c-bb26-efd4f5def2bf"

NVIDIA_HOST_MARKER = "nvcf.nvidia.com"


@pytest.fixture(autouse=True)
def block_external_nvidia(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Fail loudly if any test tries to open a channel to NVIDIA's hosted endpoint."""
    real_auth = riva_client.Auth

    def guarded_auth(*args: object, **kwargs: object) -> object:
        uri = str(kwargs.get("uri", args[2] if len(args) > 2 else ""))
        if NVIDIA_HOST_MARKER in uri:
            raise AssertionError(f"Test attempted an external NVIDIA call to {uri}; this is blocked.")
        return real_auth(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(riva_client, "Auth", guarded_auth)
    yield
