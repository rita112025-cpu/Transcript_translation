import { useState } from 'react';

type Status = 'CONFIRMED' | 'UNVERIFIED' | 'UNSUPPORTED';

interface Finding {
  item: string;
  status: Status;
  detail: string;
  source: string;
}

const findings: Finding[] = [
  {
    item: '模型官方名稱',
    status: 'CONFIRMED',
    detail: 'NVIDIA Parakeet-CTC-0.6B ASR Taiwanese Mandarin (600M parameters)。模型版本：Parakeet-CTC-XL-0.6b_zh-TW_1.0',
    source: 'build.nvidia.com/nvidia/parakeet-ctc-0_6b-zh-tw/modelcard'
  },
  {
    item: '模型來源',
    status: 'CONFIRMED',
    detail: 'NVIDIA NGC Catalog 及 build.nvidia.com。訓練資料約 90 小時台灣華語語音（Common Voice Corpus 20.0 + TechOrange-Podcast）',
    source: 'catalog.ngc.nvidia.com'
  },
  {
    item: '模型授權',
    status: 'CONFIRMED',
    detail: 'NVIDIA Community Model License。可用於商業用途。全球部署。',
    source: 'Model Card - License/Terms of Use'
  },
  {
    item: '雲端 API 可用性',
    status: 'CONFIRMED',
    detail: 'build.nvidia.com 提供託管 API。gRPC 端點：grpc.nvcf.nvidia.com:443。function-id: 8473f56d-51ef-473c-bb26-efd4f5def2bf。需 NVIDIA Developer 帳號及 API Key。',
    source: 'build.nvidia.com API Reference'
  },
  {
    item: 'NIM Container 自架',
    status: 'CONFIRMED',
    detail: 'NGC 提供 Docker 容器 nvcr.io/nim/nvidia/parakeet-ctc-0.6b-zh-tw。但已標示「End of Support」，NVIDIA 建議使用最新版本。壓縮大小 8.39 GB。',
    source: 'catalog.ngc.nvidia.com NIM Container'
  },
  {
    item: '本地推論作業系統',
    status: 'CONFIRMED',
    detail: '僅支援 Linux 及 Linux 4 Tegra。Windows 原生 Python 無法直接執行此 NIM 模型。需透過 WSL2 或純 Linux 環境。',
    source: 'Model Card - Supported OS'
  },
  {
    item: 'GPU 硬體需求',
    status: 'CONFIRMED',
    detail: '支援 NVIDIA Ampere、Hopper、Turing、Volta、Jetson。測試硬體包含 A10、A100、A30、H100、L4、L40、T4、V100、Jetson Orin。',
    source: 'Model Card - Hardware Compatibility'
  },
  {
    item: '推論引擎',
    status: 'CONFIRMED',
    detail: 'Triton Inference Server。需 Riva 2.19.0 或更高版本。',
    source: 'Model Card - Software Integration'
  },
  {
    item: '原生時間戳支援',
    status: 'UNSUPPORTED',
    detail: 'CTC 架構模型不原生產生字詞級時間戳。需透過 CTC forced alignment 或外部 VAD 工具（如 Silero VAD）取得分段時間。',
    source: 'Model Card - Output: "Does not handle special characters", no timestamp mention'
  },
  {
    item: '原生標點符號',
    status: 'UNSUPPORTED',
    detail: '模型不原生轉錄標點符號。文件明確說明："the model does not transcribe text with punctuation"。fused LM decoding 可能嘗試提供標點能力。',
    source: 'Model Card - Description'
  },
  {
    item: '說話者辨識 (Diarization)',
    status: 'UNSUPPORTED',
    detail: '此模型為純 ASR 模型，不包含 Speaker Diarization 功能。需額外使用 NVIDIA NeMo MSDD 或其他工具。',
    source: 'Model Card - 無 diarization 相關描述'
  },
  {
    item: '中英混合支援',
    status: 'CONFIRMED',
    detail: '支援 "light code-switching capability for Taiwanese Mandarin-English"。輸出為繁體中文及英文字母。',
    source: 'NGC Container Description'
  },
  {
    item: '輸入格式',
    status: 'CONFIRMED',
    detail: 'WAV 格式，16-bit Mono。最大長度受限於 GPU 記憶體。Mono channel is required。',
    source: 'Model Card - Input'
  },
  {
    item: 'Python 客戶端',
    status: 'CONFIRMED',
    detail: 'nvidia-riva-client 套件。Python gRPC 客戶端。官方提供 python-clients 倉庫。',
    source: 'build.nvidia.com API tab'
  },
  {
    item: 'Windows 原生推論',
    status: 'UNSUPPORTED',
    detail: 'Riva/NIM 僅支援 Linux。Windows 使用者需透過 WSL2 或僅使用雲端 API 模式。',
    source: 'Model Card - OS: Linux only'
  },
  {
    item: 'API 免費額度',
    status: 'UNVERIFIED',
    detail: 'build.nvidia.com 提供免費 API Key 註冊，但具體額度、限制及有效期間未在文件中明確說明。',
    source: '無法從文件中確認具體額度'
  },
];

const statusColors: Record<Status, string> = {
  CONFIRMED: 'bg-green-900/50 text-green-300 border-green-700',
  UNVERIFIED: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  UNSUPPORTED: 'bg-red-900/50 text-red-300 border-red-700',
};

const statusLabels: Record<Status, string> = {
  CONFIRMED: '✅ CONFIRMED',
  UNVERIFIED: '❓ UNVERIFIED',
  UNSUPPORTED: '❌ UNSUPPORTED',
};

export default function FeasibilityReport() {
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');

  const filtered = filter === 'ALL' ? findings : findings.filter(f => f.status === filter);
  const confirmed = findings.filter(f => f.status === 'CONFIRMED').length;
  const unverified = findings.filter(f => f.status === 'UNVERIFIED').length;
  const unsupported = findings.filter(f => f.status === 'UNSUPPORTED').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Phase 0：技術可行性驗證報告</h2>
        <p className="text-gray-400">基於 NVIDIA 官方文件之查核結果。每項結論標記驗證狀態。</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-green-400">{confirmed}</div>
          <div className="text-green-300 text-sm">已確認</div>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{unverified}</div>
          <div className="text-yellow-300 text-sm">未確認</div>
        </div>
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{unsupported}</div>
          <div className="text-red-300 text-sm">不支援</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['ALL', 'CONFIRMED', 'UNVERIFIED', 'UNSUPPORTED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {s === 'ALL' ? '全部' : statusLabels[s]}
          </button>
        ))}
      </div>

      {/* Findings Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                <th className="text-left px-4 py-3 text-gray-300 font-medium">項目</th>
                <th className="text-left px-4 py-3 text-gray-300 font-medium w-32">狀態</th>
                <th className="text-left px-4 py-3 text-gray-300 font-medium">說明</th>
                <th className="text-left px-4 py-3 text-gray-300 font-medium">來源</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filtered.map((f, i) => (
                <tr key={i} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-white font-medium">{f.item}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs border ${statusColors[f.status]}`}>
                      {statusLabels[f.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-md">{f.detail}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-300 mb-3">📌 推薦部署策略</h3>
        <div className="space-y-3 text-gray-300 text-sm">
          <p><strong className="text-white">主要方案：NVIDIA NIM Cloud API</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>無需本地 GPU，Windows 原生 Python 即可使用</li>
            <li>透過 gRPC 端點存取，需 NVIDIA API Key</li>
            <li>音訊經網路傳輸至 NVIDIA 伺服器處理</li>
            <li>適合無 NVIDIA GPU 或不想管理 Linux 環境的使用者</li>
          </ul>
          <p className="mt-3"><strong className="text-white">備選方案：Self-hosted NIM Container</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>需 Linux 環境（WSL2 或原生 Linux）+ NVIDIA GPU</li>
            <li>資料不離開本地網路</li>
            <li>需注意 Container 已標示 End of Support</li>
            <li>適合有 GPU 資源且重視資料隱私的組織</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
