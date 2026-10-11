# Meeting Transcriber TW

繁體中文會議錄音轉逐字稿系統。前端為 React + Vite，後端為 FastAPI，語音辨識透過 NVIDIA NIM 的 HTTP API 呼叫 `nvidia/parakeet-ctc-0.6b-zh-tw`。

## 目前能做什麼

- 上傳 WAV / MP3 / M4A / MP4 / FLAC / OGG 音訊（MP4 只擷取音訊軌）。
- 後端以 FFmpeg 驗證音訊、轉為 16 kHz 單聲道 WAV、依固定長度分段（預設 60 秒），每段各自呼叫模型。
- 前端顯示後端回報的真實狀態（等待、驗證、轉換、轉錄第 x/y 段、整理、完成、失敗）。
- 匯出 TXT、SRT、VTT、JSON。逐字稿內容來自模型回傳；時間戳為各分段在音訊中的起訖位置。

## 目前不能做什麼（請先閱讀）

- **雲端模式預設停用**：必須同時滿足 `ENABLE_NVIDIA_CLOUD=true`、`NVIDIA_API_KEY` 有效設定、以及每次轉錄時勾選同意。金鑰存在本身不會啟用雲端。授權檢查在上傳時與背景工作執行前各做一次，並在建立 Provider 之前再檢查，因此無法繞過。雲端 gRPC 能否回傳文字，仍需以真實金鑰與測試音訊驗證。
- **本地 NIM 必須是本機位址**：`LOCAL_NIM_BASE_URL` 只允許 127.0.0.1、localhost 或 ::1，避免音訊離開本機。
- **需要自架 NIM 服務**：本地模式會呼叫 `LOCAL_NIM_BASE_URL`（預設 `http://127.0.0.1:9000`）。服務未啟動時，轉錄會顯示明確錯誤，不會產生假結果。
- **無逐詞時間戳、無講者分離**：NIM HTTP 文件未記載 segment／word 時間戳，因此時間戳只到分段層級；所有段落標示為「講者未識別」。
- **分段可能切斷字詞**：固定長度切割在字詞中間切開時，該字可能被拆到兩段。
- **任務存在記憶體中**：後端重啟後，排隊中與已完成的任務會消失。
- **未經真實模型驗證**：本專案自帶的測試使用假 NIM 伺服器與人工產生的正弦波音訊，只證明程式流程正確，不代表辨識品質。

## 快速開始（Windows，不需系統管理員權限）

前置需求：Python 3.10+、Node.js（含 npm）、FFmpeg（放在 `toolsfmpegin`，或在 PATH 上，或在 `.env` 設定 `FFMPEG_PATH` / `FFPROBE_PATH`）。

```bash
copy .env.example .env
```

編輯 `.env`，若使用自架 NIM，確認 `LOCAL_NIM_BASE_URL` 指向正在執行的服務。然後在專案根目錄執行：

```bash
start.bat
```

`start.bat` 會檢查工具、在 `backend\.venv` 建立虛擬環境、安裝依賴（只安裝到專案內，不做全域安裝），然後選擇第一個空閒埠（後端 8000–8009、前端 3000–3009）。它**不會停止任何其他程序**；被占用的埠會略過。啟動後會確認該埠上的程序確實是本專案的服務。前端網址為 `http://127.0.0.1:<前端埠>`（請用 127.0.0.1，不要用 localhost）。服務在背景執行，日誌位於 `logs\`（`backend.log`、`backend.err.log`、`frontend.log`、`frontend.err.log`、`launcher.log`）。停止服務請用 `netstat -ano | findstr :<埠>` 找出 PID，再以 `taskkill /F /PID <pid>` 停止。

## 手動執行（開發用）

```bash
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
npm install
npm run dev
```

## 測試

```bash
backend\.venv\Scripts\python.exe -m pytest backend/tests -v
npm run test:frontend
npm run typecheck
npm run build
```

`pytest` 中需要 FFmpeg 的測試在未安裝 FFmpeg 時會顯示 `SKIPPED`，那是 **BLOCKED**，不是通過。

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | 服務狀態與 FFmpeg 是否可用 |
| GET | `/api/models` | 模型與各模式的設定狀態、能力 |
| POST | `/api/transcriptions` | multipart：`file`、`mode`（`local`/`cloud`）、`consent`。回傳 202 與 `job_id` |
| GET | `/api/transcriptions/{job_id}` | 任務狀態、進度、錯誤與結果 |

## 隱私

- API Key 只從後端 `.env` 讀取，不會送到前端，也不會出現在錯誤訊息中。
- 雲端模式必須勾選同意才能送出；後端也會驗證此同意欄位。
- 上傳檔以任務編號命名，原始檔名只作顯示用途；轉換與分段的暫存檔在任務結束後刪除。
- `.env`、音訊、字幕與逐字稿已列入 `.gitignore`。

## 專案結構

```text
backend/
  main.py                 FastAPI 路由
  config.py               環境變數設定
  schemas.py              API 資料模型
  services/audio.py       FFmpeg 驗證、轉檔、分段
  services/transcription.py  背景任務、重試、逾時、結果組裝
  services/providers/     模型介面與 NVIDIA NIM 轉接器
  tests/                  單元、API 與（若有 FFmpeg）端到端測試
src/                      React 前端
tests/frontend/           匯出邏輯測試（Node 內建測試執行器）
start.bat                 Windows 啟動腳本
```
