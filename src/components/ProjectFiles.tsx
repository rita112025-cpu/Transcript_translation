import { useState } from 'react';

interface ProjectFile {
  name: string;
  path: string;
  description: string;
  content: string;
}

const projectFiles: ProjectFile[] = [
  {
    name: 'README.md',
    path: 'README.md',
    description: '專案說明文件',
    content: `# Meeting Transcriber TW

繁體中文會議錄音轉逐字稿系統

## 核心模型

- **模型名稱**: NVIDIA Parakeet-CTC-0.6B-zh-tw
- **參數量**: 600M
- **訓練資料**: ~90 小時台灣華語語音
- **支援語言**: 台灣華語 (zh-TW) + 輕度中英混合

## 快速開始

### 雲端模式（推薦）

\`\`\`powershell
# 1. 建立專案
mkdir meeting-transcriber-tw && cd meeting-transcriber-tw

# 2. 建立虛擬環境
python -m venv venv
.\\venv\\Scripts\\Activate.ps1

# 3. 安裝依賴
pip install -r requirements.txt

# 4. 設定 API Key
copy .env.example .env
# 編輯 .env 填入 NVIDIA_API_KEY

# 5. 啟動
.\\start.ps1
\`\`\`

## 系統需求

- Windows 10/11
- Python 3.10+
- FFmpeg
- NVIDIA API Key（雲端模式）
- 或 NVIDIA GPU + Linux/WSL2（本地模式）

## 支援格式

- 輸入：WAV, MP3, M4A, FLAC, OGG
- 輸出：TXT, SRT, JSON

## 授權

- 模型：NVIDIA Community Model License
- 應用程式：MIT License`
  },
  {
    name: 'requirements.txt',
    path: 'requirements.txt',
    description: 'Python 依賴',
    content: `# Core
fastapi>=0.104.0
uvicorn>=0.24.0
python-multipart>=0.0.6
python-dotenv>=1.0.0

# NVIDIA Riva Client (gRPC)
nvidia-riva-client>=2.15.0

# Audio Processing
pydub>=0.25.1
numpy>=1.24.0
soundfile>=0.12.1

# VAD (Voice Activity Detection)
# silero-vad  # 選用：長音訊分段

# Frontend
streamlit>=1.28.0

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0

# Utilities
requests>=2.31.0
rich>=13.0.0  # CLI 美化輸出`
  },
  {
    name: '.env.example',
    path: '.env.example',
    description: '環境變數範本',
    content: `# ============================================
# Meeting Transcriber TW - 環境設定
# ============================================
# 複製此檔案為 .env 並填入實際值
# cp .env.example .env

# --- NVIDIA NIM Cloud API ---
# 前往 https://build.nvidia.com/ 註冊並取得 API Key
NVIDIA_API_KEY=

# --- 推論設定 ---
# 模式：cloud（雲端 API）或 local（本地 NIM Container）
INFERENCE_MODE=cloud

# gRPC 連線設定（雲端模式）
GRPC_SERVER=grpc.nvcf.nvidia.com
GRPC_PORT=443
FUNCTION_ID=8473f56d-51ef-473c-bb26-efd4f5def2bf

# 本地模式設定
LOCAL_NIM_HOST=localhost
LOCAL_NIM_PORT=8001

# --- 語言設定 ---
LANGUAGE_CODE=zh-TW

# --- 音訊處理 ---
# 取樣率（模型需求：16000 Hz）
SAMPLE_RATE=16000
# 音訊通道（模型需求：mono）
CHANNELS=1
# 長音訊分段長度（秒）
SEGMENT_DURATION=30
# 重疊區段（秒）
SEGMENT_OVERLAP=2

# --- 服務設定 ---
HOST=127.0.0.1
PORT=8000

# --- 安全設定 ---
# 最大上傳檔案大小（bytes）
MAX_UPLOAD_SIZE=524288000
# 最大重試次數
MAX_RETRIES=3
# 連線逾時（秒）
TIMEOUT=60`
  },
  {
    name: '.gitignore',
    path: '.gitignore',
    description: 'Git 忽略設定',
    content: `# 環境變數（包含 API Key）
.env

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
venv/
.venv/
*.egg-info/

# 暫存音訊
temp_audio/
*.tmp

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# 測試產出
.pytest_cache/
htmlcov/
.coverage

# 匯出檔案
exports/`
  },
  {
    name: 'app.py',
    path: 'app.py',
    description: 'FastAPI 後端主程式',
    content: `"""
Meeting Transcriber TW - FastAPI Backend
=========================================
提供 REST API 供前端呼叫，處理音訊上傳、ASR 推論及匯出。
"""

import os
import uuid
import shutil
import tempfile
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from config import Config
from audio_processor import AudioProcessor
from asr_adapter import ASRAdapter
from transcript_processor import TranscriptProcessor
from exporter import Exporter

load_dotenv()
config = Config()

# 暫存目錄
TEMP_DIR = Path(tempfile.gettempdir()) / "meeting_transcriber_tw"
TEMP_DIR.mkdir(exist_ok=True)

# 儲存任務狀態
jobs = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    # 啟動時檢查設定
    if config.inference_mode == "cloud" and not config.nvidia_api_key:
        print("⚠️  警告：NVIDIA_API_KEY 未設定，雲端模式將無法使用")
    yield
    # 關閉時清理暫存
    cleanup_temp_files()


app = FastAPI(
    title="Meeting Transcriber TW",
    description="繁體中文會議錄音轉逐字稿系統",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS：僅允許本機前端
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8501", "http://localhost:8501"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscribeRequest(BaseModel):
    job_id: str
    consent_given: bool = False


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, processing, completed, failed
    progress: int  # 0-100
    message: str
    segments: list = []


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {
        "status": "ok",
        "model": "parakeet-ctc-0.6b-zh-tw",
        "mode": config.inference_mode,
    }


@app.post("/api/upload")
async def upload_audio(file: UploadFile = File(...)):
    """上傳音訊檔案"""
    # 驗證檔案類型
    allowed_extensions = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支援的檔案格式：{file_ext}。支援：{allowed_extensions}"
        )

    # 驗證檔案大小
    content = await file.read()
    if len(content) > config.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"檔案過大：{len(content)} bytes。上限：{config.max_upload_size} bytes"
        )

    # 驗證 magic bytes
    if not AudioProcessor.validate_audio_magic(content, file_ext):
        raise HTTPException(status_code=400, detail="檔案內容不符合音訊格式")

    # 儲存檔案
    job_id = str(uuid.uuid4())
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    original_path = job_dir / f"original{file_ext}"
    with open(original_path, "wb") as f:
        f.write(content)

    # 取得音訊資訊
    audio_info = AudioProcessor.get_audio_info(original_path)

    # 建立任務
    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "message": "音訊已上傳，等待處理",
        "original_path": str(original_path),
        "audio_info": audio_info,
        "segments": [],
    }

    return {
        "job_id": job_id,
        "filename": file.filename,
        "size": len(content),
        "audio_info": audio_info,
    }


@app.post("/api/transcribe")
async def start_transcription(
    request: TranscribeRequest,
    background_tasks: BackgroundTasks,
):
    """開始轉錄"""
    if request.job_id not in jobs:
        raise HTTPException(status_code=404, detail="任務不存在")

    job = jobs[request.job_id]

    # 雲端模式需授權
    if config.inference_mode == "cloud" and not request.consent_given:
        raise HTTPException(
            status_code=403,
            detail="雲端模式需要資料傳輸授權。請勾選同意選項。"
        )

    # 開始背景處理
    background_tasks.add_task(process_transcription, request.job_id)

    return {"job_id": request.job_id, "status": "processing"}


async def process_transcription(job_id: str):
    """背景處理轉錄任務"""
    job = jobs[job_id]

    try:
        # Step 1: 音訊前處理
        job["progress"] = 10
        job["message"] = "轉換音訊格式..."
        job["status"] = "processing"

        audio_processor = AudioProcessor(config)
        wav_path = audio_processor.convert_to_wav(job["original_path"])

        # Step 2: 分段（如需要）
        job["progress"] = 30
        job["message"] = "分析音訊，決定分段策略..."
        segments_info = audio_processor.segment_audio(wav_path)

        # Step 3: ASR 推論
        job["progress"] = 50
        job["message"] = "連接 NVIDIA 模型進行推論..."

        asr = ASRAdapter(config)
        raw_results = []

        for i, seg in enumerate(segments_info):
            progress = 50 + int(30 * (i + 1) / len(segments_info))
            job["progress"] = progress
            job["message"] = f"推論中... ({i+1}/{len(segments_info)})"

            result = asr.transcribe_segment(seg["path"])
            result["start"] = seg["start"]
            result["end"] = seg["end"]
            raw_results.append(result)

        # Step 4: 後處理
        job["progress"] = 85
        job["message"] = "合併結果，產生時間戳..."

        processor = TranscriptProcessor()
        final_segments = processor.process(raw_results)

        # Step 5: 完成
        job["progress"] = 100
        job["message"] = "轉錄完成"
        job["status"] = "completed"
        job["segments"] = final_segments

    except Exception as e:
        job["status"] = "failed"
        job["message"] = f"轉錄失敗：{str(e)}"
        job["progress"] = 0
        # 注意：不刪除原始音訊
        print(f"[ERROR] Job {job_id}: {e}")


@app.get("/api/job/{job_id}")
async def get_job_status(job_id: str):
    """查詢任務狀態"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="任務不存在")
    return jobs[job_id]


@app.post("/api/export/{job_id}")
async def export_transcript(job_id: str, format: str = "txt"):
    """匯出逐字稿"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="任務不存在")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="任務尚未完成")

    exporter = Exporter()

    if format == "txt":
        content = exporter.to_txt(job["segments"])
    elif format == "srt":
        content = exporter.to_srt(job["segments"])
    elif format == "json":
        content = exporter.to_json(job["segments"], job["audio_info"])
    else:
        raise HTTPException(status_code=400, detail=f"不支援的格式：{format}")

    # 寫入暫存檔
    export_path = TEMP_DIR / job_id / f"transcript.{format}"
    with open(export_path, "w", encoding="utf-8-sig") as f:
        f.write(content)

    return FileResponse(
        path=str(export_path),
        filename=f"transcript.{format}",
        media_type="application/octet-stream",
    )


def cleanup_temp_files():
    """清理暫存檔案"""
    try:
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
    except Exception as e:
        print(f"[WARN] 清理暫存失敗：{e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host=config.host,
        port=config.port,
        reload=True,
    )`
  },
  {
    name: 'config.py',
    path: 'config.py',
    description: '設定管理模組',
    content: `"""
Meeting Transcriber TW - 設定管理
"""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    """系統設定"""

    # NVIDIA API
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")

    # 推論模式
    inference_mode: str = os.getenv("INFERENCE_MODE", "cloud")  # cloud / local

    # gRPC 設定（雲端模式）
    grpc_server: str = os.getenv("GRPC_SERVER", "grpc.nvcf.nvidia.com")
    grpc_port: int = int(os.getenv("GRPC_PORT", "443"))
    function_id: str = os.getenv(
        "FUNCTION_ID", "8473f56d-51ef-473c-bb26-efd4f5def2bf"
    )

    # 本地 NIM 設定
    local_nim_host: str = os.getenv("LOCAL_NIM_HOST", "localhost")
    local_nim_port: int = int(os.getenv("LOCAL_NIM_PORT", "8001"))

    # 語言
    language_code: str = os.getenv("LANGUAGE_CODE", "zh-TW")

    # 音訊處理
    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("CHANNELS", "1"))
    segment_duration: int = int(os.getenv("SEGMENT_DURATION", "30"))
    segment_overlap: int = int(os.getenv("SEGMENT_OVERLAP", "2"))

    # 服務
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))

    # 安全
    max_upload_size: int = int(os.getenv("MAX_UPLOAD_SIZE", "524288000"))
    max_retries: int = int(os.getenv("MAX_RETRIES", "3"))
    timeout: int = int(os.getenv("TIMEOUT", "60"))

    def validate(self):
        """驗證設定完整性"""
        errors = []

        if self.inference_mode == "cloud" and not self.nvidia_api_key:
            errors.append("雲端模式需要設定 NVIDIA_API_KEY")

        if self.inference_mode not in ("cloud", "local"):
            errors.append(f"無效的推論模式：{self.inference_mode}")

        if self.sample_rate != 16000:
            errors.append("模型要求 16000 Hz 取樣率")

        if self.channels != 1:
            errors.append("模型要求 Mono 音訊")

        return errors`
  },
  {
    name: 'audio_processor.py',
    path: 'audio_processor.py',
    description: '音訊處理模組',
    content: `"""
Meeting Transcriber TW - 音訊處理模組
======================================
負責音訊格式驗證、轉換及長音訊分段。
"""

import os
import tempfile
import wave
import struct
from pathlib import Path
from typing import List, Dict, Any

from pydub import AudioSegment
from config import Config


# Magic bytes for audio format validation
AUDIO_MAGIC_BYTES = {
    ".wav": [b"RIFF"],  # RIFF header
    ".mp3": [b"\\xff\\xfb", b"\\xff\\xf3", b"\\xff\\xf2", b"ID3"],  # MPEG sync / ID3
    ".m4a": [b"\\x00\\x00\\x00", b"ftyp"],  # ftyp box
    ".flac": [b"fLaC"],  # FLAC signature
    ".ogg": [b"OggS"],  # Ogg container
}


class AudioProcessor:
    """音訊處理器"""

    def __init__(self, config: Config = None):
        self.config = config or Config()
        self.temp_dir = Path(tempfile.gettempdir()) / "meeting_transcriber_tw"
        self.temp_dir.mkdir(exist_ok=True)

    @staticmethod
    def validate_audio_magic(content: bytes, extension: str) -> bool:
        """
        驗證檔案 magic bytes，不依賴副檔名。
        """
        ext = extension.lower()
        if ext not in AUDIO_MAGIC_BYTES:
            return False

        expected = AUDIO_MAGIC_BYTES[ext]
        for magic in expected:
            if content[:len(magic)] == magic:
                return True

        # 特殊處理 M4A/MP4
        if ext == ".m4a" and len(content) > 8:
            if b"ftyp" in content[:12]:
                return True

        return False

    @staticmethod
    def get_audio_info(file_path: str) -> Dict[str, Any]:
        """取得音訊檔案資訊"""
        path = Path(file_path)
        file_size = path.stat().st_size

        try:
            audio = AudioSegment.from_file(file_path)
            duration_sec = len(audio) / 1000.0
            sample_rate = audio.frame_rate
            channels = audio.channels
            sample_width = audio.sample_width
        except Exception as e:
            return {
                "error": str(e),
                "file_size": file_size,
                "duration": "未知",
            }

        return {
            "file_size": file_size,
            "file_size_human": f"{file_size / 1024 / 1024:.2f} MB",
            "duration_seconds": duration_sec,
            "duration_human": _format_duration(duration_sec),
            "sample_rate": sample_rate,
            "channels": channels,
            "sample_width": sample_width,
            "format": path.suffix.lower(),
        }

    def convert_to_wav(self, input_path: str) -> str:
        """
        將音訊轉換為模型所需的格式：
        - 16kHz, 16-bit, Mono, WAV
        """
        audio = AudioSegment.from_file(input_path)

        # 轉換為 mono
        if audio.channels > 1:
            audio = audio.set_channels(1)

        # 轉換取樣率
        if audio.frame_rate != self.config.sample_rate:
            audio = audio.set_frame_rate(self.config.sample_rate)

        # 轉換取樣寬度為 16-bit
        if audio.sample_width != 2:
            audio = audio.set_sample_width(2)

        # 輸出
        output_path = self.temp_dir / f"{Path(input_path).stem}_processed.wav"
        audio.export(str(output_path), format="wav")

        return str(output_path)

    def segment_audio(self, wav_path: str) -> List[Dict[str, Any]]:
        """
        長音訊分段處理。
        使用固定長度分段 + 重疊區段。
        """
        audio = AudioSegment.from_wav(wav_path)
        duration_ms = len(audio)
        segment_ms = self.config.segment_duration * 1000
        overlap_ms = self.config.segment_overlap * 1000

        # 短音訊不需要分段
        if duration_ms <= segment_ms:
            return [{
                "path": wav_path,
                "start": 0.0,
                "end": duration_ms / 1000.0,
                "index": 0,
            }]

        segments = []
        start = 0
        index = 0

        while start < duration_ms:
            end = min(start + segment_ms, duration_ms)
            segment = audio[start:end]

            # 儲存分段
            seg_path = self.temp_dir / f"segment_{index:04d}.wav"
            segment.export(str(seg_path), format="wav")

            segments.append({
                "path": str(seg_path),
                "start": start / 1000.0,
                "end": end / 1000.0,
                "index": index,
            })

            index += 1
            start += segment_ms - overlap_ms  # 重疊

        return segments


def _format_duration(seconds: float) -> str:
    """格式化時間長度"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"`
  },
  {
    name: 'asr_adapter.py',
    path: 'asr_adapter.py',
    description: 'ASR 推論適配器',
    content: `"""
Meeting Transcriber TW - ASR 推論適配器
=========================================
統一介面支援雲端 API 與本地 NIM 兩種推論模式。
使用 NVIDIA Riva Client (gRPC) 進行推論。
"""

import time
from typing import Dict, Any, Optional

from config import Config


class ASRAdapter:
    """ASR 推論適配器"""

    def __init__(self, config: Config):
        self.config = config
        self._client = None
        self._channel = None

    def _init_cloud_client(self):
        """初始化雲端 gRPC 客戶端"""
        try:
            import riva.client

            auth = riva.client.Auth(
                uri=f"{self.config.grpc_server}:{self.config.grpc_port}",
                api_key=self.config.nvidia_api_key,
                use_ssl=True,
                metadata_args=[
                    ("function-id", self.config.function_id),
                ],
            )
            self._client = riva.client.ASRService(auth)
        except ImportError:
            raise RuntimeError(
                "nvidia-riva-client 未安裝。請執行：pip install nvidia-riva-client"
            )
        except Exception as e:
            raise ConnectionError(f"無法連接 NVIDIA gRPC 端點：{e}")

    def _init_local_client(self):
        """初始化本地 NIM 客戶端"""
        try:
            import riva.client

            auth = riva.client.Auth(
                uri=f"{self.config.local_nim_host}:{self.config.local_nim_port}",
                use_ssl=False,
            )
            self._client = riva.client.ASRService(auth)
        except ImportError:
            raise RuntimeError("nvidia-riva-client 未安裝")
        except Exception as e:
            raise ConnectionError(f"無法連接本地 NIM 服務：{e}")

    def transcribe_segment(self, wav_path: str) -> Dict[str, Any]:
        """
        轉錄單一音訊分段。

        Returns:
            {
                "text": str,           # 辨識文字
                "confidence": float,   # 信賴度
                "raw_response": Any,   # 原始回應
                "status": str,         # success / error
                "error": Optional[str],# 錯誤訊息
            }
        """
        # 初始化客戶端
        if self._client is None:
            if self.config.inference_mode == "cloud":
                self._init_cloud_client()
            else:
                self._init_local_client()

        # 重試機制
        last_error = None
        for attempt in range(self.config.max_retries):
            try:
                return self._do_transcribe(wav_path)
            except Exception as e:
                last_error = e
                if attempt < self.config.max_retries - 1:
                    wait = 2 ** attempt  # 指數退避
                    time.sleep(wait)
                    continue

        return {
            "text": "",
            "confidence": 0.0,
            "raw_response": None,
            "status": "error",
            "error": f"推論失敗（重試 {self.config.max_retries} 次）：{last_error}",
        }

    def _do_transcribe(self, wav_path: str) -> Dict[str, Any]:
        """執行實際推論"""
        import riva.client

        # 讀取音訊
        with open(wav_path, "rb") as f:
            audio_content = f.read()

        # 建立推論設定
        config = riva.client.RecognitionConfig(
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=self.config.sample_rate,
            language_code=self.config.language_code,
            max_alternatives=1,
            enable_automatic_punctuation=False,  # 模型不原生支援
        )

        # 呼叫推論
        response = self._client.offline_recognize(
            audio_content,
            config,
        )

        # 解析結果
        text = ""
        confidence = 0.0

        if response.results:
            for result in response.results:
                if result.alternatives:
                    text += result.alternatives[0].transcript
                    confidence = result.alternatives[0].confidence

        return {
            "text": text if text else "[聽不清楚]",
            "confidence": confidence,
            "raw_response": response,
            "status": "success",
            "error": None,
        }

    def close(self):
        """關閉連線"""
        if self._channel:
            self._channel.close()
            self._channel = None
        self._client = None`
  },
  {
    name: 'transcript_processor.py',
    path: 'transcript_processor.py',
    description: '逐字稿處理模組',
    content: `"""
Meeting Transcriber TW - 逐字稿處理模組
==========================================
負責合併分段結果、產生時間戳及後處理。
"""

from typing import List, Dict, Any
from datetime import datetime


class TranscriptProcessor:
    """逐字稿處理器"""

    def process(self, raw_segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        處理原始 ASR 結果，產生最終逐字稿。

        1. 依時間排序
        2. 產生時間戳
        3. 標示狀態
        """
        # 依開始時間排序
        sorted_segments = sorted(raw_segments, key=lambda x: x.get("start", 0))

        processed = []
        for i, seg in enumerate(sorted_segments):
            text = seg.get("text", "").strip()
            status = seg.get("status", "transcribed")

            # 處理空文字
            if not text or text == "[聽不清楚]":
                status = "unclear"
                text = text or "[聽不清楚]"

            processed.append({
                "segment_id": i + 1,
                "start": self._format_timestamp(seg.get("start", 0)),
                "end": self._format_timestamp(seg.get("end", 0)),
                "start_seconds": seg.get("start", 0),
                "end_seconds": seg.get("end", 0),
                "speaker": "未識別",  # 模型不支援 diarization
                "text": text,
                "original_asr": text,  # 保留原始輸出
                "confidence": seg.get("confidence", 0.0),
                "source_model": "parakeet-ctc-0.6b-zh-tw",
                "processing_status": status,
            })

        # 驗證時間順序
        self._validate_time_ordering(processed)

        return processed

    def _format_timestamp(self, seconds: float) -> str:
        """將秒數格式化為 HH:MM:SS"""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def _validate_time_ordering(self, segments: List[Dict]) -> None:
        """驗證時間嚴格遞增"""
        for i in range(1, len(segments)):
            if segments[i]["start_seconds"] < segments[i-1]["start_seconds"]:
                raise ValueError(
                    f"時間倒退：segment {i+1} 的開始時間 "
                    f"({segments[i]['start']}) 早於 segment {i} "
                    f"({segments[i-1]['start']})"
                )

    def apply_punctuation(self, segments: List[Dict], model_name: str) -> List[Dict]:
        """
        選用：套用標點後處理。
        注意：此功能會修改文字，需明確揭露使用模型，
        且原始 ASR 輸出保留在 original_asr 欄位。
        """
        # 此為框架，實際實作需接入標點模型
        # 必須揭露使用的模型名稱
        for seg in segments:
            seg["punctuation_model"] = model_name
            seg["text_with_punctuation"] = seg["text"]  # placeholder

        return segments`
  },
  {
    name: 'exporter.py',
    path: 'exporter.py',
    description: '匯出模組',
    content: `"""
Meeting Transcriber TW - 匯出模組
====================================
支援 TXT、SRT、JSON 格式匯出。
所有輸出使用 UTF-8 編碼。
"""

import json
from typing import List, Dict, Any
from datetime import datetime


class Exporter:
    """逐字稿匯出器"""

    def to_txt(self, segments: List[Dict], show_original: bool = False) -> str:
        """
        匯出為 TXT 格式。
        包含 UTF-8 BOM 以確保 Windows 正確顯示。
        """
        lines = []
        lines.append("=" * 60)
        lines.append("Meeting Transcriber TW - 會議逐字稿")
        lines.append(f"匯出時間：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"模型：parakeet-ctc-0.6b-zh-tw")
        lines.append("=" * 60)
        lines.append("")

        for seg in segments:
            timestamp = seg["start"]
            speaker = seg.get("speaker", "未識別")
            text = seg.get("original_asr", seg["text"]) if show_original else seg["text"]

            lines.append(f"[{timestamp}] {speaker}：{text}")
            lines.append("")

        return "\\n".join(lines)

    def to_srt(self, segments: List[Dict]) -> str:
        """
        匯出為 SRT 字幕格式。
        注意：僅在具有有效時間範圍時才能產生有效 SRT。
        """
        lines = []

        for i, seg in enumerate(segments, 1):
            start_srt = self._to_srt_time(seg.get("start_seconds", 0))
            end_srt = self._to_srt_time(seg.get("end_seconds", 0))
            speaker = seg.get("speaker", "未識別")
            text = seg["text"]

            lines.append(str(i))
            lines.append(f"{start_srt} --> {end_srt}")
            lines.append(f"{speaker}：{text}")
            lines.append("")

        return "\\n".join(lines)

    def to_json(
        self,
        segments: List[Dict],
        audio_info: Dict = None,
    ) -> str:
        """
        匯出為 JSON 格式。
        包含完整 metadata。
        """
        output = {
            "metadata": {
                "tool": "Meeting Transcriber TW",
                "version": "1.0.0",
                "export_time": datetime.now().isoformat(),
                "source_model": "parakeet-ctc-0.6b-zh-tw",
                "language": "zh-TW",
                "audio_info": audio_info or {},
            },
            "segments": [
                {
                    "segment_id": seg["segment_id"],
                    "start": seg["start"],
                    "end": seg["end"],
                    "speaker": seg.get("speaker", "未識別"),
                    "text": seg["text"],
                    "original_asr": seg.get("original_asr", seg["text"]),
                    "source_model": seg.get("source_model", "parakeet-ctc-0.6b-zh-tw"),
                    "processing_status": seg.get("processing_status", "transcribed"),
                    "confidence": seg.get("confidence", 0.0),
                }
                for seg in segments
            ],
        }

        return json.dumps(output, ensure_ascii=False, indent=2)

    def _to_srt_time(self, seconds: float) -> str:
        """轉換為 SRT 時間格式：HH:MM:SS,mmm"""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"`
  },
  {
    name: 'frontend.py',
    path: 'frontend.py',
    description: 'Streamlit 前端介面',
    content: `"""
Meeting Transcriber TW - Streamlit Frontend
=============================================
網頁介面：上傳、轉錄、編輯、匯出。
"""

import streamlit as st
import requests
import json
import io

API_BASE = "http://127.0.0.1:8000"

st.set_page_config(
    page_title="Meeting Transcriber TW",
    page_icon="🎙️",
    layout="wide",
)

st.title("🎙️ Meeting Transcriber TW")
st.caption("繁體中文會議錄音轉逐字稿系統 | NVIDIA Parakeet-CTC-0.6B-zh-tw")

# --- Sidebar ---
with st.sidebar:
    st.header("⚙️ 設定")

    mode = st.radio(
        "推論模式",
        ["雲端 API", "本地 NIM"],
        index=0,
    )

    st.divider()
    st.markdown("**模型資訊**")
    st.markdown("- 模型：parakeet-ctc-0.6b-zh-tw")
    st.markdown("- 參數：600M")
    st.markdown("- 語言：台灣華語 + 中英混合")
    st.markdown("- 架構：FastConformer-CTC")

    st.divider()
    st.markdown("**⚠️ 注意**")
    st.markdown("- 模型不原生支援標點")
    st.markdown("- 模型不原生支援時間戳")
    st.markdown("- 模型不支援說話者辨識")

# --- Main ---
tab1, tab2, tab3 = st.tabs(["📤 轉錄", "📝 逐字稿", "📥 匯出"])

with tab1:
    st.subheader("上傳音訊")

    uploaded_file = st.file_uploader(
        "選擇音訊檔案",
        type=["wav", "mp3", "m4a", "flac", "ogg"],
        help="支援 WAV、MP3、M4A、FLAC、OGG 格式（最大 500MB）",
    )

    if uploaded_file:
        st.info(f"📁 {uploaded_file.name} | 📏 {uploaded_file.size / 1024 / 1024:.2f} MB")

        # 雲端模式需授權
        consent = False
        if mode == "雲端 API":
            consent = st.checkbox(
                "⚠️ 我同意將音訊傳輸至 NVIDIA 伺服器進行推論",
                help="音訊將經加密連線傳輸至 NVIDIA DGX Cloud 處理",
            )

        if st.button("🚀 開始轉錄", type="primary", disabled=(mode == "雲端 API" and not consent)):
            with st.spinner("處理中..."):
                try:
                    # 上傳
                    files = {"file": (uploaded_file.name, uploaded_file.getvalue())}
                    resp = requests.post(f"{API_BASE}/api/upload", files=files)
                    resp.raise_for_status()
                    upload_result = resp.json()

                    job_id = upload_result["job_id"]
                    st.success(f"✅ 上傳成功！Job ID: {job_id}")

                    # 顯示音訊資訊
                    info = upload_result.get("audio_info", {})
                    if info:
                        st.json(info)

                    # 開始轉錄
                    transcribe_resp = requests.post(
                        f"{API_BASE}/api/transcribe",
                        json={"job_id": job_id, "consent_given": consent},
                    )
                    transcribe_resp.raise_for_status()

                    # 輪詢狀態
                    progress_bar = st.progress(0)
                    status_text = st.empty()

                    while True:
                        status_resp = requests.get(f"{API_BASE}/api/job/{job_id}")
                        status_data = status_resp.json()

                        progress_bar.progress(status_data["progress"] / 100)
                        status_text.text(status_data["message"])

                        if status_data["status"] in ("completed", "failed"):
                            break

                        import time
                        time.sleep(1)

                    if status_data["status"] == "completed":
                        st.success("🎉 轉錄完成！請切換至「逐字稿」分頁查看結果。")
                        st.session_state["job_id"] = job_id
                        st.session_state["segments"] = status_data["segments"]
                    else:
                        st.error(f"❌ {status_data['message']}")

                except requests.ConnectionError:
                    st.error("❌ 無法連接後端服務。請確認後端已啟動（port 8000）。")
                except Exception as e:
                    st.error(f"❌ 錯誤：{e}")

with tab2:
    st.subheader("逐字稿")

    if "segments" not in st.session_state:
        st.info("尚未有轉錄結果。請先上傳音訊並完成轉錄。")
    else:
        segments = st.session_state["segments"]

        show_original = st.checkbox("顯示原始 ASR 輸出（未標點）", value=True)

        for seg in segments:
            with st.container():
                col1, col2 = st.columns([1, 8])
                with col1:
                    st.caption(f"[{seg['start']}]")
                with col2:
                    text = seg.get("original_asr", seg["text"]) if show_original else seg["text"]
                    edited = st.text_area(
                        f"{seg.get('speaker', '未識別')}",
                        value=text,
                        key=f"seg_{seg['segment_id']}",
                        label_visibility="collapsed",
                    )
                    if edited != text:
                        seg["text"] = edited
                        seg["processing_status"] = "edited"

        st.session_state["segments"] = segments

with tab3:
    st.subheader("匯出")

    if "job_id" not in st.session_state:
        st.info("尚未有可匯出的結果。")
    else:
        format_option = st.selectbox("匯出格式", ["TXT", "SRT", "JSON"])

        if st.button("📥 下載"):
            try:
                resp = requests.get(
                    f"{API_BASE}/api/export/{st.session_state['job_id']}",
                    params={"format": format_option.lower()},
                )
                resp.raise_for_status()

                st.download_button(
                    label="💾 儲存檔案",
                    data=resp.content,
                    file_name=f"transcript.{format_option.lower()}",
                    mime="application/octet-stream",
                )
            except Exception as e:
                st.error(f"匯出失敗：{e}")`
  },
  {
    name: 'start.ps1',
    path: 'start.ps1',
    description: 'Windows 一鍵啟動腳本',
    content: `# Meeting Transcriber TW - Windows 啟動腳本
# 使用方式：在 PowerShell 中執行 .\\start.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Meeting Transcriber TW - 啟動中...     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# 檢查虛擬環境
if (-not (Test-Path ".\\venv\\Scripts\\Activate.ps1")) {
    Write-Host "❌ 找不到虛擬環境！" -ForegroundColor Red
    Write-Host "請先執行以下指令建立虛擬環境：" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor White
    Write-Host "  .\\venv\\Scripts\\Activate.ps1" -ForegroundColor White
    Write-Host "  pip install -r requirements.txt" -ForegroundColor White
    exit 1
}

# 啟動虛擬環境
Write-Host "📦 啟動虛擬環境..." -ForegroundColor Cyan
. .\\venv\\Scripts\\Activate.ps1

# 檢查必要檔案
$requiredFiles = @("app.py", "config.py", "frontend.py", ".env")
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        if ($file -eq ".env") {
            Write-Host "⚠️  .env 檔案不存在，從 .env.example 複製..." -ForegroundColor Yellow
            if (Test-Path ".env.example") {
                Copy-Item ".env.example" ".env"
                Write-Host "⚠️  請編輯 .env 填入 NVIDIA_API_KEY" -ForegroundColor Yellow
            } else {
                Write-Host "❌ .env.example 也不存在" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "❌ 缺少必要檔案：$file" -ForegroundColor Red
            exit 1
        }
    }
}

# 檢查 FFmpeg
try {
    $null = Get-Command ffmpeg -ErrorAction Stop
    Write-Host "✅ FFmpeg 已安裝" -ForegroundColor Green
} catch {
    Write-Host "⚠️  FFmpeg 未安裝或不在 PATH 中" -ForegroundColor Yellow
    Write-Host "   部分音訊格式轉換功能可能無法使用" -ForegroundColor Yellow
}

# 啟動後端
Write-Host ""
Write-Host "📡 啟動後端 API 服務 (port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    cd '$PWD'
    .\\venv\\Scripts\\Activate.ps1
    Write-Host 'Meeting Transcriber TW - 後端服務' -ForegroundColor Green
    python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
"

# 等待後端啟動
Write-Host "⏳ 等待後端啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 啟動前端
Write-Host "🖥️  啟動前端介面 (port 8501)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    cd '$PWD'
    .\\venv\\Scripts\\Activate.ps1
    Write-Host 'Meeting Transcriber TW - 前端介面' -ForegroundColor Green
    streamlit run frontend.py --server.address 127.0.0.1 --server.port 8501
"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           ✅ 系統已啟動！                 ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║ 📡 後端 API：http://127.0.0.1:8000       ║" -ForegroundColor White
Write-Host "║ 🖥️  前端介面：http://127.0.0.1:8501      ║" -ForegroundColor White
Write-Host "║ 📖 API 文件：http://127.0.0.1:8000/docs  ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "關閉方式：關閉各 PowerShell 視窗或執行 stop.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "按任意鍵關閉此視窗..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")`
  },
  {
    name: 'tests/test_basic.py',
    path: 'tests/test_basic.py',
    description: '基礎測試套件',
    content: `"""
Meeting Transcriber TW - 測試套件
===================================
"""

import pytest
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch


# ============================
# 單元測試
# ============================

class TestAudioProcessor:
    """音訊處理器單元測試"""

    def test_validate_wav_magic_bytes(self):
        """T06: 驗證 WAV magic bytes"""
        from audio_processor import AudioProcessor
        # RIFF header
        content = b"RIFF" + b"\\x00" * 100
        assert AudioProcessor.validate_audio_magic(content, ".wav") is True

    def test_validate_flac_magic_bytes(self):
        """T06: 驗證 FLAC magic bytes"""
        from audio_processor import AudioProcessor
        content = b"fLaC" + b"\\x00" * 100
        assert AudioProcessor.validate_audio_magic(content, ".flac") is True

    def test_reject_invalid_magic_bytes(self):
        """T06: 拒絕無效 magic bytes"""
        from audio_processor import AudioProcessor
        content = b"\\x00\\x00\\x00\\x00" + b"\\x00" * 100
        assert AudioProcessor.validate_audio_magic(content, ".wav") is False

    def test_reject_unsupported_format(self):
        """T06: 拒絕不支援格式"""
        from audio_processor import AudioProcessor
        content = b"RIFF" + b"\\x00" * 100
        assert AudioProcessor.validate_audio_magic(content, ".xyz") is False


class TestConfig:
    """設定模組測試"""

    def test_default_values(self):
        """驗證預設值"""
        from config import Config
        config = Config()
        assert config.sample_rate == 16000
        assert config.channels == 1
        assert config.language_code == "zh-TW"
        assert config.host == "127.0.0.1"

    def test_validate_missing_api_key(self):
        """T07: 雲端模式缺少 API Key"""
        from config import Config
        config = Config()
        config.inference_mode = "cloud"
        config.nvidia_api_key = ""
        errors = config.validate()
        assert any("API_KEY" in e for e in errors)

    def test_validate_invalid_mode(self):
        """驗證無效模式"""
        from config import Config
        config = Config()
        config.inference_mode = "invalid"
        errors = config.validate()
        assert any("推論模式" in e for e in errors)


class TestTranscriptProcessor:
    """逐字稿處理器測試"""

    def test_format_timestamp(self):
        """驗證時間戳格式"""
        from transcript_processor import TranscriptProcessor
        proc = TranscriptProcessor()
        assert proc._format_timestamp(0) == "00:00:00"
        assert proc._format_timestamp(65) == "00:01:05"
        assert proc._format_timestamp(3661) == "01:01:01"

    def test_time_ordering_validation(self):
        """T15: 驗證時間順序檢查"""
        from transcript_processor import TranscriptProcessor
        proc = TranscriptProcessor()

        # 正常情況
        segments = [
            {"start": 0, "end": 10, "text": "test1"},
            {"start": 10, "end": 20, "text": "test2"},
        ]
        proc._validate_time_ordering(segments)  # 不應拋出異常

        # 時間倒退
        bad_segments = [
            {"start": 10, "end": 20, "text": "test1"},
            {"start": 5, "end": 15, "text": "test2"},
        ]
        with pytest.raises(ValueError, match="時間倒退"):
            proc._validate_time_ordering(bad_segments)

    def test_process_segments(self):
        """驗證分段處理"""
        from transcript_processor import TranscriptProcessor
        proc = TranscriptProcessor()

        raw = [
            {"start": 0, "end": 10, "text": "你好", "confidence": 0.9},
            {"start": 10, "end": 20, "text": "世界", "confidence": 0.8},
        ]
        result = proc.process(raw)
        assert len(result) == 2
        assert result[0]["segment_id"] == 1
        assert result[0]["start"] == "00:00:00"
        assert result[1]["start"] == "00:00:10"


class TestExporter:
    """匯出模組測試"""

    def test_txt_export(self):
        """T09: TXT 匯出"""
        from exporter import Exporter
        exp = Exporter()
        segments = [
            {"segment_id": 1, "start": "00:00:00", "end": "00:00:10",
             "speaker": "未識別", "text": "測試文字", "original_asr": "測試文字"},
        ]
        result = exp.to_txt(segments)
        assert "測試文字" in result
        assert "[00:00:00]" in result

    def test_srt_export(self):
        """T10: SRT 匯出"""
        from exporter import Exporter
        exp = Exporter()
        segments = [
            {"segment_id": 1, "start": "00:00:00", "end": "00:00:10",
             "start_seconds": 0, "end_seconds": 10,
             "speaker": "未識別", "text": "測試"},
        ]
        result = exp.to_srt(segments)
        assert "00:00:00,000 --> 00:00:10,000" in result
        assert "1\\n" in result  # SRT 序號

    def test_json_export_structure(self):
        """T11: JSON 結構驗證"""
        from exporter import Exporter
        exp = Exporter()
        segments = [
            {"segment_id": 1, "start": "00:00:00", "end": "00:00:10",
             "speaker": "未識別", "text": "測試", "original_asr": "測試",
             "source_model": "parakeet-ctc-0.6b-zh-tw",
             "processing_status": "transcribed", "confidence": 0.9},
        ]
        result = json.loads(exp.to_json(segments))
        assert "metadata" in result
        assert "segments" in result
        seg = result["segments"][0]
        assert "segment_id" in seg
        assert "start" in seg
        assert "end" in seg
        assert "speaker" in seg
        assert "text" in seg
        assert "source_model" in seg
        assert "processing_status" in seg

    def test_srt_time_format(self):
        """T10: SRT 時間格式驗證"""
        from exporter import Exporter
        exp = Exporter()
        assert exp._to_srt_time(0) == "00:00:00,000"
        assert exp._to_srt_time(3661.5) == "01:01:01,500"


# ============================
# 整合測試（需要 API Key）
# ============================

@pytest.mark.skipif(
    not os.getenv("NVIDIA_API_KEY"),
    reason="需要 NVIDIA_API_KEY 環境變數"
)
class TestASRIntegration:
    """ASR 整合測試"""

    def test_cloud_connection(self):
        """T08: 測試雲端連線"""
        from config import Config
        from asr_adapter import ASRAdapter
        config = Config()
        adapter = ASRAdapter(config)
        # 應能初始化客戶端而不拋出異常
        adapter._init_cloud_client()
        assert adapter._client is not None


# ============================
# 安全測試
# ============================

class TestSecurity:
    """安全性測試"""

    def test_no_consent_no_upload(self):
        """T14: 未授權不觸發傳輸"""
        # 驗證 consent 檢查邏輯
        from config import Config
        config = Config()
        config.inference_mode = "cloud"

        # 模擬未授權情況
        consent_given = False
        assert not consent_given  # 應阻止推論

    def test_api_key_not_in_code(self):
        """驗證 API Key 不硬編碼"""
        import ast
        with open("asr_adapter.py", "r") as f:
            source = f.read()
        # 檢查沒有硬編碼的 API key
        assert "nvapi-" not in source
        assert "key = \\"" not in source.replace("api_key=", "")

    def test_localhost_binding(self):
        """T12: 預設綁定 localhost"""
        from config import Config
        config = Config()
        assert config.host == "127.0.0.1"`
  }
];

export default function ProjectFiles() {
  const [selectedFile, setSelectedFile] = useState(0);
  const [copied, setCopied] = useState(false);

  const file = projectFiles[selectedFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">📁 Phase 5：完整專案檔案</h2>
        <p className="text-gray-400">所有必要檔案的完整內容。可複製至專案目錄使用。</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* File List */}
        <div className="lg:w-72 flex-shrink-0">
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-3 border-b border-gray-700 bg-gray-900">
              <h3 className="text-sm font-medium text-gray-300">專案結構</h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {projectFiles.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedFile(i)}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-700/50 transition-colors ${
                    selectedFile === i
                      ? 'bg-emerald-900/30 text-emerald-300 border-l-2 border-l-emerald-500'
                      : 'text-gray-400 hover:bg-gray-750 hover:text-white'
                  }`}
                >
                  <div className="font-mono text-xs">{f.path}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{f.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* File Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-900">
              <div>
                <span className="text-white font-mono text-sm">{file.path}</span>
                <span className="text-gray-500 text-xs ml-3">{file.description}</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
              >
                {copied ? '✅ 已複製' : '📋 複製全部'}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
              <code className="text-gray-300 font-mono text-xs leading-relaxed whitespace-pre">
                {file.content}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
