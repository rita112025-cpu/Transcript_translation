"""Cloud authorization: feature switch, configuration, consent, and the worker re-check.

All cases here use fake keys and fake providers. None of them can reach NVIDIA; the autouse
fixture in conftest.py would fail the test if one tried.
"""

from __future__ import annotations

import time
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
import riva.client as riva_client

from backend.config import Settings
from backend.services.providers import registry
from backend.services.providers.base import TranscriptionProvider
from backend.services.providers.registry import AuthorizationError, authorize_mode, build_provider
from backend.services.transcription import TranscriptionService

FAKE_KEY = "nvapi-unit-test-fake"


def _settings(tmp_path: Path, **overrides: Any) -> Settings:
    base = Settings(
        ffmpeg_path="ffmpeg",
        ffprobe_path="ffprobe",
        work_dir=tmp_path / "work",
        max_upload_mb=500,
        max_duration_seconds=3600,
        chunk_seconds=60,
        job_timeout_seconds=60,
        request_timeout_seconds=5,
        max_retries=0,
        retry_backoff_seconds=0,
        local_nim_base_url="http://127.0.0.1:9000",
        enable_nvidia_cloud=False,
        nvidia_grpc_server="grpc.nvcf.nvidia.com:443",
        nvidia_grpc_function_id="8473f56d-51ef-473c-bb26-efd4f5def2bf",
        nvidia_api_key="",
    )
    return replace(base, **overrides)


def _cloud_ready(tmp_path: Path) -> Settings:
    return _settings(tmp_path, enable_nvidia_cloud=True, nvidia_api_key=FAKE_KEY)


# --- Decision matrix -------------------------------------------------------------------

def test_default_setting_disables_cloud(tmp_path: Path) -> None:
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("cloud", True, _settings(tmp_path, nvidia_api_key=FAKE_KEY))
    assert info.value.status_code == 403
    assert "ENABLE_NVIDIA_CLOUD" in str(info.value)


def test_api_key_alone_does_not_enable_cloud(tmp_path: Path) -> None:
    settings = _settings(tmp_path, nvidia_api_key=FAKE_KEY, enable_nvidia_cloud=False)
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("cloud", True, settings)
    assert info.value.status_code == 403


def test_enabled_without_key_is_unconfigured(tmp_path: Path) -> None:
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("cloud", True, _settings(tmp_path, enable_nvidia_cloud=True))
    assert info.value.status_code == 503
    assert "NVIDIA_API_KEY" in str(info.value)


def test_enabled_and_configured_but_no_consent_is_refused(tmp_path: Path) -> None:
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("cloud", False, _cloud_ready(tmp_path))
    assert info.value.status_code == 400


def test_enabled_configured_and_consented_is_authorized(tmp_path: Path) -> None:
    authorize_mode("cloud", True, _cloud_ready(tmp_path))  # no exception


def test_local_mode_needs_no_consent_or_key(tmp_path: Path) -> None:
    authorize_mode("local", False, _settings(tmp_path))


def test_local_mode_rejects_non_loopback_endpoint(tmp_path: Path) -> None:
    settings = _settings(tmp_path, local_nim_base_url="http://nim.example.com:9000")
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("local", False, settings)
    assert info.value.status_code == 503
    assert "本機" in str(info.value)


def test_unknown_mode_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("sftp", True, _cloud_ready(tmp_path))
    assert info.value.status_code == 400


def test_switch_is_checked_before_configuration(tmp_path: Path) -> None:
    # The switch is checked before anything else, so a half-configured cloud stays off.
    with pytest.raises(AuthorizationError) as info:
        authorize_mode("cloud", True, _settings(tmp_path, nvidia_grpc_server=""))
    assert info.value.status_code == 403


# --- Provider factory cannot bypass the gate ----------------------------------------

def test_build_provider_refuses_cloud_without_consent_and_opens_no_channel(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    opened: list[str] = []
    monkeypatch.setattr(riva_client, "Auth", lambda **kw: opened.append(str(kw)) or object())

    with pytest.raises(AuthorizationError):
        build_provider("cloud", _cloud_ready(tmp_path), False)
    with pytest.raises(AuthorizationError):
        build_provider("cloud", _settings(tmp_path, nvidia_api_key=FAKE_KEY), True)

    assert opened == []


def test_build_provider_cloud_with_full_authorization_constructs_grpc_provider(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    class _Auth:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)

    monkeypatch.setattr(riva_client, "Auth", _Auth)
    monkeypatch.setattr(riva_client, "ASRService", lambda auth: object())

    provider = build_provider("cloud", _cloud_ready(tmp_path), True)

    assert provider is not None
    assert captured["uri"] == "grpc.nvcf.nvidia.com:443"
    assert captured["use_ssl"] is True
    assert ["function-id", "8473f56d-51ef-473c-bb26-efd4f5def2bf"] in captured["metadata_args"]
    assert ["authorization", f"Bearer {FAKE_KEY}"] in captured["metadata_args"]


def test_list_models_reports_switch_state_without_leaking_key(tmp_path: Path) -> None:
    off = {m.mode: m for m in registry.list_models(_settings(tmp_path, nvidia_api_key=FAKE_KEY))}
    assert off["cloud"].configured is False
    assert FAKE_KEY not in off["cloud"].status_message

    on = {m.mode: m for m in registry.list_models(_cloud_ready(tmp_path))}
    assert on["cloud"].configured is True
    assert FAKE_KEY not in on["cloud"].status_message
    assert FAKE_KEY not in on["cloud"].endpoint


# --- Worker re-check (between submit and background execution) ----------------------

class _RecordingFactory:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bool]] = []

    def __call__(self, mode: str, settings: Settings, consent: bool) -> TranscriptionProvider:
        self.calls.append((mode, consent))
        raise AssertionError("provider must not be built for an unauthorized job")


def _wait_terminal(service: TranscriptionService, job_id: str) -> Any:
    for _ in range(200):
        job = service.get(job_id)
        assert job is not None
        if job.status in ("completed", "failed"):
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish")


@pytest.mark.parametrize(
    "enabled, consent, expected",
    [(False, True, "雲端轉錄功能未啟用"), (True, False, "需先同意")],
)
def test_worker_refuses_unauthorized_cloud_job_before_any_provider(
    tmp_path: Path, enabled: bool, consent: bool, expected: str
) -> None:
    settings = _settings(tmp_path, enable_nvidia_cloud=enabled, nvidia_api_key=FAKE_KEY)
    factory = _RecordingFactory()
    service = TranscriptionService(settings, provider_factory=factory)
    job_dir = tmp_path / "work" / "j1"
    job_dir.mkdir(parents=True)
    source = job_dir / "input.wav"
    source.write_bytes(b"not really audio")
    try:
        service.submit(job_id="j1", input_path=source, source_filename="a.wav", mode="cloud", consent=consent)
        job = _wait_terminal(service, "j1")
    finally:
        service.shutdown()

    assert job.status == "failed"
    assert expected in (job.error or "")
    assert factory.calls == []
    assert not job_dir.exists()  # temporary files removed even on refusal
