export default function Architecture() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Phase 1：系統架構設計</h2>
        <p className="text-zinc-400">前後端分離、推論引擎可替換的模組化架構</p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">📐 架構圖</h3>
        <div className="bg-[#0a0a0b] rounded-[14px] p-6 font-mono text-xs overflow-x-auto">
          <pre className="text-zinc-300">{`
┌─────────────────────────────────────────────────────────────────────────┐
│                        Windows 10/11 使用者環境                           │
│                                                                         │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐   │
│  │   瀏覽器      │    │           Python Backend (FastAPI)            │   │
│  │  (Frontend)  │◄──►│                                              │   │
│  │  Streamlit   │    │  ┌─────────────┐  ┌──────────────────────┐   │   │
│  │  / React     │    │  │  Audio      │  │  ASR Adapter          │   │   │
│  │              │    │  │  Processor  │  │  ┌─────────────────┐  │   │   │
│  │  • 上傳音訊  │    │  │  (FFmpeg)   │  │  │ Cloud Mode      │  │   │   │
│  │  • 播放音訊  │    │  │             │  │  │ (NIM gRPC API)  │  │   │   │
│  │  • 編輯逐字稿│    │  └──────┬──────┘  │  └────────┬────────┘  │   │   │
│  │  • 匯出檔案  │    │         │         │           │           │   │   │
│  │              │    │         ▼         │  ┌────────┴────────┐  │   │   │
│  └──────────────┘    │  ┌─────────────┐  │  │ Local Mode      │  │   │   │
│                      │  │ Transcript  │  │  │ (NIM Container) │  │   │   │
│                      │  │ Processor   │  │  └─────────────────┘  │   │   │
│                      │  │ (標點/分段) │  └──────────┬────────────┘   │   │
│                      │  └──────┬──────┘             │                │   │
│                      │         ▼                    │                │   │
│                      │  ┌─────────────┐             │                │   │
│                      │  │  Exporter   │             │                │   │
│                      │  │ TXT/SRT/JSON│             │                │   │
│                      │  └─────────────┘             │                │   │
│                      └──────────────────────────────┼────────────────┘   │
│                                                     │                    │
└─────────────────────────────────────────────────────┼────────────────────┘
                                                      │
                              ┌────────────────────────┘
                              ▼
              ┌───────────────────────────────┐
              │   NVIDIA NIM Cloud API        │
              │   grpc.nvcf.nvidia.com:443    │
              │   function-id: 8473f56d-...   │
              │   Auth: Bearer $NVIDIA_API_KEY│
              └───────────────────────────────┘
          `}</pre>
        </div>
      </div>

      {/* Module Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h4 className="text-zinc-100 font-semibold mb-3">📦 Audio Processor</h4>
          <ul className="text-sm text-zinc-300 space-y-1.5">
            <li>• 驗證檔案格式（magic bytes，非副檔名）</li>
            <li>• 使用 FFmpeg 轉換為 16kHz 16-bit Mono WAV</li>
            <li>• 顯示檔案大小與時長</li>
            <li>• 長音訊 VAD 分段（Silero VAD / pydub）</li>
            <li>• 重疊區段處理避免漏字</li>
            <li>• 保留原始檔案不覆寫</li>
          </ul>
        </div>

        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h4 className="text-zinc-100 font-semibold mb-3">🤖 ASR Adapter</h4>
          <ul className="text-sm text-zinc-300 space-y-1.5">
            <li>• 統一介面支援 Cloud / Local 模式</li>
            <li>• Cloud：nvidia-riva-client gRPC 呼叫</li>
            <li>• Local：NIM Container REST/gRPC 呼叫</li>
            <li>• 連線逾時、重試（有限次數）</li>
            <li>• 錯誤分類與診斷訊息</li>
            <li>• 保留原始 ASR 輸出</li>
          </ul>
        </div>

        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h4 className="text-zinc-100 font-semibold mb-3">📝 Transcript Processor</h4>
          <ul className="text-sm text-zinc-300 space-y-1.5">
            <li>• 合併分段結果，依時間排序</li>
            <li>• 產生時間戳 [HH:MM:SS]（分段級）</li>
            <li>• 選用標點後處理（需揭露使用模型）</li>
            <li>• 保留原始 ASR 與校正版獨立存儲</li>
            <li>• 無法辨識區段標示 [聽不清楚]</li>
          </ul>
        </div>

        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h4 className="text-zinc-100 font-semibold mb-3">📤 Exporter</h4>
          <ul className="text-sm text-zinc-300 space-y-1.5">
            <li>• TXT：可讀逐字稿，UTF-8 BOM</li>
            <li>• SRT：字幕格式（需有效時間範圍）</li>
            <li>• JSON：結構化資料含所有 metadata</li>
            <li>• 確保 Windows 繁體中文正確顯示</li>
            <li>• 匯出前驗證格式有效性</li>
          </ul>
        </div>
      </div>

      {/* Data Flow */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">🔄 資料流向</h3>
        <div className="space-y-3">
          {[
            { step: '1', title: '音訊輸入', desc: '使用者上傳 WAV/MP3/M4A/FLAC → 驗證 magic bytes → 顯示檔案資訊' },
            { step: '2', title: '音訊前處理', desc: 'FFmpeg 轉 16kHz Mono WAV → VAD 分段（如超過模型限制）→ 產生分段時間映射' },
            { step: '3', title: 'ASR 推論', desc: '逐段送入 NVIDIA Parakeet CTC 0.6B zh-TW → 取得文字結果 → 記錄每段狀態' },
            { step: '4', title: '後處理', desc: '合併分段 → 加入時間戳 → 選用標點修正 → 產生原始版與校正版本' },
            { step: '5', title: '使用者校正', desc: '瀏覽逐字稿 → 編輯修正 → 系統記錄修改（不覆寫原始 ASR）' },
            { step: '6', title: '匯出', desc: '選擇格式 → 驗證資料完整性 → 產生 UTF-8 編碼檔案 → 下載' },
          ].map((s) => (
            <div key={s.step} className="flex gap-4 items-start">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                {s.step}
              </div>
              <div>
                <h4 className="text-white font-medium">{s.title}</h4>
                <p className="text-zinc-400 text-sm">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy Boundary */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">🔒 隱私邊界</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-900/20 border border-green-800 rounded-[14px] p-4">
            <h4 className="text-green-300 font-medium mb-2">🏠 本地（不離開設備）</h4>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>• 原始音訊檔案</li>
              <li>• 轉換後的 WAV 暫存檔</li>
              <li>• 逐字稿及校正資料</li>
              <li>• API Key（.env 檔案）</li>
              <li>• 匯出檔案</li>
            </ul>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-[14px] p-4">
            <h4 className="text-yellow-300 font-medium mb-2">☁️ 雲端模式（經網路傳輸）</h4>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>• 音訊片段（gRPC 傳輸至 NVIDIA）</li>
              <li>• 傳輸對象：NVIDIA DGX Cloud</li>
              <li>• 需使用者明確授權</li>
              <li>• 未授權時不得觸發傳輸</li>
              <li>• 連線中斷時停止並告知</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Comparison */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">⚖️ 本地 vs 雲端比較</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0a0b]">
              <tr>
                <th className="text-left px-4 py-2 text-zinc-300">項目</th>
                <th className="text-left px-4 py-2 text-zinc-300">雲端 API</th>
                <th className="text-left px-4 py-2 text-zinc-300">本地 NIM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {[
                ['部署難度', '低（僅需 API Key）', '高（需 Linux + GPU + Docker）'],
                ['Windows 相容', '✅ 原生支援', '❌ 需 WSL2'],
                ['GPU 需求', '無', 'NVIDIA Ampere+'],
                ['資料隱私', '音訊經網路傳輸', '資料不離開本地'],
                ['成本', 'API 用量計費', 'GPU 硬體成本'],
                ['維護', 'NVIDIA 管理', '自行維護'],
                ['模型版本', '自動更新', '需手動更新 Container'],
                ['延遲', '網路延遲 + 推論', '僅推論延遲'],
              ].map(([item, cloud, local], i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-white font-medium">{item}</td>
                  <td className="px-4 py-2 text-zinc-300">{cloud}</td>
                  <td className="px-4 py-2 text-zinc-300">{local}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded-[14px]">
          <p className="text-blue-300 text-sm">
            <strong>結論：</strong>推薦以雲端 API 為主要方案。Windows 使用者無需額外硬體或 Linux 環境即可使用。
            若組織有 GPU 資源且重視資料隱私，可部署本地 NIM Container 作為備選。
          </p>
        </div>
      </div>
    </div>
  );
}
