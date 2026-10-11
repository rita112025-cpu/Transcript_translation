"""API contract tests with FastAPI's TestClient.

The end-to-end test runs the real FFmpeg pipeline and real HTTP calls to a *fake* NIM server
written in this file. It proves plumbing (upload → convert → chunk → HTTP → result), not model
accuracy. Real-model verification needs a running NVIDIA NIM service and is tracked separately.
"""

from __future__ import annotations

import http.server
import json
import shutil
import threading
import time
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.config import Settings, load_settings
from backend.services.audio import tool_available
from backend.tests.test_audio_ffmpeg import make_tone_wav


def _settings(tmp_path: Path, **overrides: object) -> Settings:
    base = Settings(
        ffmpeg_path=load_settings().ffmpeg_path,
        ffprobe_path=load_settings().ffprobe_path,
        work_dir=tmp_path / "work",
        max_upload_mb=500,
        max_duration_seconds=3600,
        chunk_seconds=60,
        job_timeout_seconds=120,
        request_timeout_seconds=10,
        max_retries=0,
        retry_backoff_seconds=0,
        local_nim_base_url="http://127.0.0.1:9",  # nothing listens here
        enable_nvidia_cloud=False,
        nvidia_grpc_server="grpc.nvcf.nvidia.com:443",
        nvidia_grpc_function_id="8473f56d-51ef-473c-bb26-efd4f5def2bf",
        nvidia_api_key="",
        job_db_path=tmp_path / "jobs.sqlite3",
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


@pytest.fixture()
def client_factory(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):  # type: ignore[no-untyped-def]
    def make(settings: Settings) -> TestClient:
        monkeypatch.setattr(main, "get_settings", lambda: settings)
        return TestClient(main.app)

    return make


def test_health_reports_ok_and_tool_presence(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert isinstance(body["ffmpeg_available"], bool)


def test_models_marks_cloud_unconfigured_without_key(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        models = {m["mode"]: m for m in client.get("/api/models").json()}
    assert models["local"]["configured"] is True
    assert models["cloud"]["configured"] is False
    assert models["cloud"]["requires_consent"] is True
    assert models["local"]["capabilities"]["segment_timestamps"] is False


def test_rejects_unsupported_extension(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("evil.exe", b"MZ", "application/octet-stream")},
            data={"mode": "local"},
        )
    assert response.status_code == 415


def test_cloud_requires_consent(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    settings = _settings(tmp_path, enable_nvidia_cloud=True, nvidia_api_key="nvapi-test")
    with client_factory(settings) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", b"RIFF", "audio/wav")},
            data={"mode": "cloud", "consent": "false"},
        )
    assert response.status_code == 400


def test_cloud_disabled_by_default_even_with_key_and_consent(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    settings = _settings(tmp_path, nvidia_api_key="nvapi-test")
    with client_factory(settings) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", b"RIFF", "audio/wav")},
            data={"mode": "cloud", "consent": "true"},
        )
    assert response.status_code == 403
    assert not (tmp_path / "work").exists() or list((tmp_path / "work").iterdir()) == []


def test_cloud_without_key_returns_503_not_fake_success(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    settings = _settings(tmp_path, enable_nvidia_cloud=True)
    with client_factory(settings) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", b"RIFF", "audio/wav")},
            data={"mode": "cloud", "consent": "true"},
        )
    assert response.status_code == 503
    assert "NVIDIA_API_KEY" in response.json()["detail"]


def test_rejects_empty_upload(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", b"", "audio/wav")},
            data={"mode": "local"},
        )
    assert response.status_code == 400
    work = tmp_path / "work"
    assert not work.exists() or list(work.iterdir()) == []


def test_rejects_oversized_upload_and_cleans_up(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    settings = _settings(tmp_path, max_upload_mb=1)
    payload = b"0" * (1024 * 1024 + 1)
    with client_factory(settings) as client:
        response = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", payload, "audio/wav")},
            data={"mode": "local"},
        )
    assert response.status_code == 413
    assert list((tmp_path / "work").iterdir()) == []


def test_unknown_and_malformed_job_ids_return_404(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        assert client.get("/api/transcriptions/" + "a" * 32).status_code == 404
        assert client.get("/api/transcriptions/../../etc").status_code == 404


def test_upload_rate_limit_returns_429_with_retry_after(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    upload = {"file": ("a.exe", b"x", "application/octet-stream")}
    with client_factory(_settings(tmp_path, rate_limit_per_minute=2)) as client:
        first = client.post("/api/transcriptions", files=upload)
        second = client.post("/api/transcriptions", files=upload)  # rejected by validation, still counted
        limited = client.post("/api/transcriptions", files=upload)

    assert [first.status_code, second.status_code] == [415, 415]
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0


def test_cors_allows_loopback_origin_only(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with client_factory(_settings(tmp_path)) as client:
        allowed = client.options(
            "/api/transcriptions",
            headers={"Origin": "http://127.0.0.1:3005", "Access-Control-Request-Method": "POST"},
        )
        blocked = client.options(
            "/api/transcriptions",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )

    assert allowed.headers.get("access-control-allow-origin") == "http://127.0.0.1:3005"
    assert "access-control-allow-origin" not in blocked.headers


class _FakeNim(http.server.BaseHTTPRequestHandler):
    """Stand-in for the NIM HTTP route. Returns numbered text; it is NOT a speech model."""

    counter = 0

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        if self.path != "/v1/audio/transcriptions":
            self.send_error(404)
            return
        type(self).counter += 1
        body = json.dumps({"text": f"假模型段落{type(self).counter}", "usage": {"type": "duration", "seconds": 1.0}})
        payload = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


@pytest.fixture()
def fake_nim() -> Iterator[str]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _FakeNim)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.skipif(
    not (tool_available(load_settings().ffmpeg_path) and tool_available(load_settings().ffprobe_path)),
    reason="FFmpeg/ffprobe not found (set FFMPEG_PATH/FFPROBE_PATH in .env): BLOCKED for end-to-end pipeline test",
)
def test_end_to_end_chunked_job_against_fake_nim(client_factory, tmp_path: Path, fake_nim: str) -> None:  # type: ignore[no-untyped-def]
    tone = make_tone_wav(tmp_path / "meeting.wav", seconds=150.0, rate=8000)
    settings = _settings(tmp_path, local_nim_base_url=fake_nim, chunk_seconds=60)
    _FakeNim.counter = 0

    with client_factory(settings) as client:
        created = client.post(
            "/api/transcriptions",
            files={"file": ("會議 錄音.wav", tone.read_bytes(), "audio/wav")},
            data={"mode": "local"},
        )
        assert created.status_code == 202, created.text
        job_id = created.json()["job_id"]

        deadline = time.monotonic() + 60
        job = created.json()
        while job["status"] not in ("completed", "failed") and time.monotonic() < deadline:
            time.sleep(0.2)
            job = client.get(f"/api/transcriptions/{job_id}").json()

    assert job["status"] == "completed", job
    result = job["result"]
    assert result["status"] == "completed"
    assert result["source_filename"] == "會議 錄音.wav"
    assert result["mode"] == "local"
    assert result["duration_seconds"] == pytest.approx(150.0, abs=0.1)
    assert [(s["start"], s["end"]) for s in result["segments"]] == [(0.0, 60.0), (60.0, 120.0), (120.0, 150.0)]
    assert [s["text"] for s in result["segments"]] == ["假模型段落1", "假模型段落2", "假模型段落3"]
    assert result["text"] == "假模型段落1假模型段落2假模型段落3"
    assert all(s["speaker"] == "講者未識別" for s in result["segments"])
    assert not (tmp_path / "work" / job_id).exists()


def test_job_fails_visibly_when_nim_is_down(client_factory, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    # Without FFmpeg this fails at probe with a clear message; with FFmpeg it fails at the
    # connection step. Either way the job must be "failed", never "completed".
    tone_bytes = b"RIFF0000WAVEfmt " * 4
    with client_factory(_settings(tmp_path)) as client:
        created = client.post(
            "/api/transcriptions",
            files={"file": ("a.wav", tone_bytes, "audio/wav")},
            data={"mode": "local"},
        )
        job_id = created.json()["job_id"]
        deadline = time.monotonic() + 30
        job = created.json()
        while job["status"] not in ("completed", "failed") and time.monotonic() < deadline:
            time.sleep(0.2)
            job = client.get(f"/api/transcriptions/{job_id}").json()
    assert job["status"] == "failed"
    assert job["result"] is None
    assert job["error"]
