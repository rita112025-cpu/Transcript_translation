import { useState } from 'react';

export default function InstallationGuide() {
  const [activeSection, setActiveSection] = useState<'prereq' | 'cloud' | 'local' | 'start'>('prereq');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">⚙️ 安裝與執行指南</h2>
        <p className="text-gray-400">Windows 10/11 環境，可直接複製執行的 PowerShell 指令</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'prereq' as const, label: '1. 前置條件' },
          { id: 'cloud' as const, label: '2. 雲端模式安裝' },
          { id: 'local' as const, label: '3. 本地模式安裝' },
          { id: 'start' as const, label: '4. 啟動與操作' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.id ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'prereq' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">📋 必要軟體</h3>
            <div className="space-y-3">
              {[
                { name: 'Python 3.10+', desc: '建議 3.10 或 3.11', check: 'python --version' },
                { name: 'Git', desc: '用於下載專案', check: 'git --version' },
                { name: 'FFmpeg', desc: '音訊格式轉換', check: 'ffmpeg -version' },
                { name: 'NVIDIA API Key', desc: 'build.nvidia.com 註冊取得', check: '（雲端模式需要）' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-gray-900 rounded-lg">
                  <div className="w-8 h-8 bg-blue-900/50 rounded flex items-center justify-center text-blue-300 text-sm font-bold">{i + 1}</div>
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{item.name}</p>
                    <p className="text-gray-400 text-xs">{item.desc}</p>
                  </div>
                  <code className="text-xs text-emerald-400 bg-gray-800 px-2 py-1 rounded">{item.check}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">🔧 環境檢查指令（唯讀）</h3>
            <CodeBlock title="PowerShell - 環境檢查" code={`# 檢查 Python 版本
python --version

# 檢查 pip
pip --version

# 檢查 Git
git --version

# 檢查 FFmpeg
ffmpeg -version

# 檢查 NVIDIA GPU（如有）
nvidia-smi

# 檢查 CUDA 版本（如有 GPU）
nvcc --version

# 檢查 WSL2 狀態（本地模式需要）
wsl --status`} />
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">📦 FFmpeg Windows 安裝（免管理員）</h3>
            <CodeBlock title="PowerShell - 下載 FFmpeg" code={`# 方法1：使用 winget（Windows 10/11 內建）
winget install Gyan.FFmpeg

# 方法2：手動下載（免管理員）
# 1. 前往 https://www.gyan.dev/ffmpeg/builds/
# 2. 下載 ffmpeg-release-essentials.zip
# 3. 解壓縮至 C:\\Users\\你的使用者\\tools\\ffmpeg
# 4. 將 bin 目錄加入 PATH：
$ffmpegPath = "$env:USERPROFILE\\tools\\ffmpeg\\bin"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$ffmpegPath", "User")

# 驗證
ffmpeg -version`} />
          </div>
        </div>
      )}

      {activeSection === 'cloud' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">☁️ 雲端模式安裝（推薦）</h3>
            <p className="text-gray-400 text-sm mb-4">無需 GPU，Windows 原生 Python 即可執行。</p>

            <CodeBlock title="Step 1：建立專案目錄" code={`# 建立專案資料夾
mkdir "$env:USERPROFILE\\meeting-transcriber-tw"
cd "$env:USERPROFILE\\meeting-transcriber-tw"

# 初始化 Git（選用）
git init`} />

            <CodeBlock title="Step 2：建立 Python 虛擬環境" code={`# 建立虛擬環境
python -m venv venv

# 啟動虛擬環境
.\\venv\\Scripts\\Activate.ps1

# 如果出現執行原則錯誤，執行：
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`} />

            <CodeBlock title="Step 3：安裝依賴" code={`# 升級 pip
python -m pip install --upgrade pip

# 安裝核心依賴
pip install fastapi uvicorn python-multipart
pip install nvidia-riva-client
pip install pydub numpy
pip install python-dotenv
pip install streamlit requests

# 安裝 FFmpeg Python 綁定（選用）
pip install ffmpeg-python`} />

            <CodeBlock title="Step 4：設定環境變數" code={`# 建立 .env 檔案（API Key 不寫入 Git）
@"
# NVIDIA NIM Cloud API Key
# 前往 https://build.nvidia.com/ 取得
NVIDIA_API_KEY=your_api_key_here

# 推論模式：cloud 或 local
INFERENCE_MODE=cloud

# gRPC 端點（預設值）
GRPC_SERVER=grpc.nvcf.nvidia.com
GRPC_PORT=443
FUNCTION_ID=8473f56d-51ef-473c-bb26-efd4f5def2bf

# 語言設定
LANGUAGE_CODE=zh-TW

# 服務綁定位址（安全：僅本機）
HOST=127.0.0.1
PORT=8000
"@ | Out-File -Encoding utf8 .env`} />
          </div>
        </div>
      )}

      {activeSection === 'local' && (
        <div className="space-y-4">
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4">
            <p className="text-yellow-300 text-sm">
              ⚠️ 本地模式需要：Linux 環境（WSL2 或原生）+ NVIDIA GPU（Ampere 架構以上）+ Docker + NVIDIA Container Toolkit。
              NIM Container 已標示「End of Support」，建議使用雲端 API 或等待更新版本。
            </p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">🖥️ 本地 NIM Container 部署</h3>

            <CodeBlock title="WSL2 前置準備" code={`# 在 Windows PowerShell 中啟用 WSL2
wsl --install

# 重啟後安裝 Ubuntu
wsl --install -d Ubuntu-22.04

# 進入 WSL2
wsl

# 在 WSL2 中安裝 Docker
sudo apt update && sudo apt install -y docker.io
sudo usermod -aG docker $USER

# 安裝 NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker`} />

            <CodeBlock title="拉取並啟動 NIM Container" code={`# 登入 NGC
echo "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin

# 拉取 Parakeet zh-TW NIM Container
docker pull nvcr.io/nim/nvidia/parakeet-ctc-0.6b-zh-tw:latest

# 啟動 NIM 服務
docker run --gpus all \\
  --shm-size=8g \\
  -p 8001:8001 \\
  -e NGC_API_KEY=$NGC_API_KEY \\
  nvcr.io/nim/nvidia/parakeet-ctc-0.6b-zh-tw:latest

# 驗證服務（等待啟動完成）
curl http://localhost:8001/v2/health/ready`} />
          </div>
        </div>
      )}

      {activeSection === 'start' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">🚀 啟動系統</h3>

            <CodeBlock title="一鍵啟動（PowerShell）" code={`# 確保在專案目錄
cd "$env:USERPROFILE\\meeting-transcriber-tw"

# 啟動虛擬環境
.\\venv\\Scripts\\Activate.ps1

# 啟動 FastAPI 後端
python -m uvicorn app:app --host 127.0.0.1 --port 8000

# 另開一個終端視窗，啟動 Streamlit 前端
.\\venv\\Scripts\\Activate.ps1
streamlit run frontend.py --server.address 127.0.0.1 --server.port 8501`} />

            <CodeBlock title="Windows 啟動腳本（start.ps1）" code={`# start.ps1 - 一鍵啟動腳本
# 使用方式：右鍵 → 使用 PowerShell 執行

$ErrorActionPreference = "Stop"

Write-Host "🚀 Meeting Transcriber TW - 啟動中..." -ForegroundColor Green

# 檢查虛擬環境
if (-not (Test-Path ".\\venv\\Scripts\\Activate.ps1")) {
    Write-Host "❌ 找不到虛擬環境，請先執行安裝步驟" -ForegroundColor Red
    exit 1
}

# 啟動虛擬環境
. .\\venv\\Scripts\\Activate.ps1

# 檢查 API Key
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
python -c "from dotenv import load_dotenv; load_dotenv(); import os; assert os.getenv('NVIDIA_API_KEY'), 'API Key 未設定'" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  API Key 未設定，請編輯 .env 檔案" -ForegroundColor Yellow
}

# 啟動後端
Write-Host "📡 啟動後端服務 (port 8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\\venv\\Scripts\\Activate.ps1; python -m uvicorn app:app --host 127.0.0.1 --port 8000"

# 等待後端啟動
Start-Sleep -Seconds 3

# 啟動前端
Write-Host "🖥️  啟動前端介面 (port 8501)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\\venv\\Scripts\\Activate.ps1; streamlit run frontend.py --server.address 127.0.0.1 --server.port 8501"

Write-Host ""
Write-Host "✅ 系統已啟動！" -ForegroundColor Green
Write-Host "📡 後端 API：http://127.0.0.1:8000" -ForegroundColor White
Write-Host "🖥️  前端介面：http://127.0.0.1:8501" -ForegroundColor White
Write-Host ""
Write-Host "按任意鍵關閉此視窗（後端與前端會繼續執行）" -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")`} />

            <CodeBlock title="關閉系統" code={`# 關閉所有相關進程
Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "uvicorn|streamlit" } | Stop-Process -Force

# 或使用 taskkill
taskkill /F /FI "WINDOWTITLE eq *uvicorn*"
taskkill /F /FI "WINDOWTITLE eq *streamlit*"

#  deactivate 虛擬環境
deactivate`} />
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between bg-gray-900 px-4 py-2 rounded-t-lg border border-gray-700 border-b-0">
        <span className="text-xs text-gray-400">{title}</span>
        <button onClick={handleCopy} className="text-xs text-gray-400 hover:text-white transition-colors">
          {copied ? '✅ 已複製' : '📋 複製'}
        </button>
      </div>
      <pre className="bg-gray-950 p-4 rounded-b-lg border border-gray-700 overflow-x-auto text-sm">
        <code className="text-gray-300 font-mono text-xs leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}
