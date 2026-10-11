type Tab = 'dashboard' | 'feasibility' | 'architecture' | 'transcription' | 'installation' | 'testing' | 'files' | 'maintenance';

export default function Dashboard({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-white/[0.07] to-white/[0.02] rounded-[24px] p-8 border border-white/10">
        <h2 className="text-3xl font-bold text-white mb-3">繁體中文會議錄音轉逐字稿系統</h2>
        <p className="text-zinc-300 text-lg mb-6 max-w-3xl">
          使用 NVIDIA Parakeet-CTC-0.6B-zh-tw 模型，將會議錄音轉換為具備時間資訊的繁體中文逐字稿。
          支援本地推論與雲端 API 兩種模式，以 Windows 10/11 為主要操作環境。
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onNavigate('transcription')} className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-[14px] font-medium transition-colors">
            🎙️ 開始轉錄
          </button>
          <button onClick={() => onNavigate('installation')} className="px-5 py-2.5 bg-[#1a1a1e] hover:bg-[#27272a] text-white rounded-[14px] font-medium transition-colors">
            ⚙️ 安裝指南
          </button>
          <button onClick={() => onNavigate('feasibility')} className="px-5 py-2.5 bg-[#1a1a1e] hover:bg-[#27272a] text-white rounded-[14px] font-medium transition-colors">
            🔍 技術報告
          </button>
        </div>
      </div>

      {/* Key Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: '🎯', title: '指定模型', desc: 'NVIDIA Parakeet-CTC-0.6B-zh-tw，600M 參數，專為台灣華語訓練' },
          { icon: '☁️', title: '雲端推論', desc: '透過 NVIDIA NIM Cloud API (build.nvidia.com) 使用 gRPC 端點' },
          { icon: '🖥️', title: '本地部署', desc: '支援 NIM Container 自架，需 Linux + NVIDIA GPU (Ampere+)' },
          { icon: '📝', title: '逐字稿輸出', desc: 'TXT / SRT / JSON 格式，UTF-8 編碼，繁體中文正確顯示' },
          { icon: '✏️', title: '人工校正', desc: '原始 ASR 輸出與校正版獨立保存，可追溯修改歷程' },
          { icon: '🔒', title: '隱私保護', desc: '預設 localhost 綁定，API Key 不硬編碼，音訊不自動上傳' },
        ].map((f, i) => (
          <div key={i} className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08] hover:border-white/25 transition-colors">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h3 className="text-white font-semibold mb-1">{f.title}</h3>
            <p className="text-zinc-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* System Status */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">📋 系統狀態摘要</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">模型可用性</span>
              <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded-full">✅ CONFIRMED</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">雲端 API 端點</span>
              <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded-full">✅ CONFIRMED</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">NIM Container</span>
              <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded-full">⚠️ End of Support</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">原生時間戳</span>
              <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded-full">❌ UNSUPPORTED</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">原生標點符號</span>
              <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded-full">❌ UNSUPPORTED</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">說話者辨識</span>
              <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded-full">❌ UNSUPPORTED</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">Windows 原生推論</span>
              <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded-full">❌ UNSUPPORTED</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#0a0a0b] rounded-[14px]">
              <span className="text-zinc-300">推薦方案</span>
              <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-full">🌐 Cloud API</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">🔄 端到端工作流程</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {['選擇錄音檔', '→', '音訊驗證', '→', '格式轉換', '→', '分段處理', '→', 'NVIDIA 模型推論', '→', '逐字稿輸出', '→', '人工校正', '→', '匯出存檔'].map((step, i) => (
            <span key={i} className={step === '→' ? 'text-zinc-100 font-bold' : 'px-3 py-1.5 bg-[#0a0a0b] rounded-[14px] text-zinc-300 border border-white/15'}>
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
