"""SQLite storage for job snapshots, so job status and results survive a backend restart.

Only the public ``JobResponse`` snapshot is stored, never the uploaded audio. Jobs that were still
running when the process stopped cannot be resumed, so the service marks them as failed on startup.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from backend.schemas import JobResponse

TERMINAL_STATUSES = ("completed", "failed")


class JobStore:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    snapshot TEXT NOT NULL
                )
                """
            )
            self._conn.commit()

    def save(self, snapshot: JobResponse) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO jobs (job_id, status, updated_at, snapshot) VALUES (?, ?, ?, ?)",
                (snapshot.job_id, snapshot.status, snapshot.updated_at, snapshot.model_dump_json()),
            )
            self._conn.commit()

    def load(self, job_id: str) -> JobResponse | None:
        with self._lock:
            row = self._conn.execute("SELECT snapshot FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return JobResponse.model_validate_json(row[0]) if row else None

    def load_unfinished(self) -> list[JobResponse]:
        placeholders = ", ".join("?" for _ in TERMINAL_STATUSES)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT snapshot FROM jobs WHERE status NOT IN ({placeholders})", TERMINAL_STATUSES
            ).fetchall()
        return [JobResponse.model_validate_json(row[0]) for row in rows]

    def prune_finished(self, keep: int) -> None:
        """Delete finished jobs except the ``keep`` most recently updated ones."""
        placeholders = ", ".join("?" for _ in TERMINAL_STATUSES)
        with self._lock:
            self._conn.execute(
                f"""
                DELETE FROM jobs
                WHERE status IN ({placeholders})
                  AND job_id NOT IN (
                    SELECT job_id FROM jobs WHERE status IN ({placeholders})
                    ORDER BY updated_at DESC LIMIT ?
                  )
                """,
                (*TERMINAL_STATUSES, *TERMINAL_STATUSES, keep),
            )
            self._conn.commit()
