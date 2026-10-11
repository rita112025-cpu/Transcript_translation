export default function Maintenance() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">🔧 Phase 5：維護及擴充指南</h2>
        <p className="text-zinc-400">系統長期維護、版本管理及功能擴充說明</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Version */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>🤖</span> 模型版本管理
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• 雲端 API 版本由 NVIDIA 管理，可能自動更新</li>
            <li>• 本地 NIM Container 需手動拉取新版本</li>
            <li>• 建議鎖定 function-id，避免 API 變更影響</li>
            <li>• 定期檢查 NGC Catalog 是否有更新模型</li>
            <li>• 保留模型版本記錄以便問題追溯</li>
            <li>• 測試新模型版本時使用獨立環境</li>
          </ul>
          <div className="mt-3 p-2 bg-[#0a0a0b] rounded text-xs font-mono text-zinc-400">
            <p># 檢查模型版本</p>
            <p className="text-zinc-100">curl https://api.nvcf.nvidia.com/v2/nim/nvidia/parakeet-ctc-0.6b-zh-tw</p>
          </div>
        </div>

        {/* Dependencies */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>📦</span> Python 依賴更新
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• 定期執行 <code className="text-zinc-100">pip list --outdated</code></li>
            <li>• <code className="text-zinc-100">nvidia-riva-client</code> 需與 Riva 版本對應</li>
            <li>• 更新前在測試環境驗證</li>
            <li>• 使用 <code className="text-zinc-100">pip-tools</code> 或 <code className="text-zinc-100">poetry</code> 鎖定版本</li>
            <li>• 關注安全漏洞公告（pip-audit）</li>
            <li>• FFmpeg 版本影響音訊轉換相容性</li>
          </ul>
          <div className="mt-3 p-2 bg-[#0a0a0b] rounded text-xs font-mono text-zinc-400">
            <p className="text-zinc-100">pip-audit</p>
            <p className="text-zinc-100">pip list --outdated</p>
          </div>
        </div>

        {/* API Endpoint */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>🌐</span> API 端點變更風險
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• function-id 可能隨模型版本變更</li>
            <li>• gRPC proto 定義可能更新</li>
            <li>• 端點 URL 原則上穩定，但需監控</li>
            <li>• 訂閱 NVIDIA 開發者公告</li>
            <li>• 實作端點健康檢查機制</li>
            <li>• 保留 fallback 至其他 Parakeet 模型的能力</li>
          </ul>
          <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-800 rounded text-xs text-yellow-300">
            ⚠️ NIM Container 已標示「End of Support」，本地部署需評估替代方案。
          </div>
        </div>

        {/* Inference Failure */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>⚠️</span> 推論失敗處理
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• 有限重試（指數退避，最多 3 次）</li>
            <li>• 不刪除原始音訊檔案</li>
            <li>• 記錄失敗原因至日誌（不含會議內容）</li>
            <li>• 區分暫時性錯誤與永久錯誤</li>
            <li>• 提供可操作的診斷建議</li>
            <li>• 支援從失敗點重新開始（斷點續傳）</li>
          </ul>
          <div className="mt-3 p-2 bg-[#0a0a0b] rounded text-xs font-mono text-zinc-400">
            <p># 常見錯誤及處理</p>
            <p>• UNAUTHENTICATED → 檢查 API Key</p>
            <p>• DEADLINE_EXCEEDED → 增加逾時或分段</p>
            <p>• RESOURCE_EXHAUSTED → 減少並發請求</p>
          </div>
        </div>

        {/* Performance */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>⚡</span> 長時間錄音效能瓶頸
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• <strong>記憶體：</strong>分段處理避免載入完整音訊</li>
            <li>• <strong>網路：</strong>頻寬限制影響雲端模式速度</li>
            <li>• <strong>磁碟 I/O：</strong>暫存檔寫入/讀取</li>
            <li>• <strong>API 限流：</strong>注意 rate limit</li>
            <li>• <strong>建議：</strong>30 分鐘以下直接處理，以上使用串流</li>
            <li>• <strong>監控：</strong>記錄每段處理時間及資源使用</li>
          </ul>
          <div className="mt-3 p-2 bg-[#0a0a0b] rounded text-xs text-zinc-400">
            💡 60 分鐘錄音約需 3-5 分鐘處理（雲端模式，視網路速度）
          </div>
        </div>

        {/* Future Features */}
        <div className="bg-[#121214] rounded-[20px] p-5 border border-white/[0.08]">
          <h3 className="text-zinc-100 font-semibold mb-3 flex items-center gap-2">
            <span>🚀</span> 後續擴充方向
          </h3>
          <ul className="text-sm text-zinc-300 space-y-2">
            <li>• <strong>Speaker Diarization：</strong>整合 NeMo MSDD 或 pyannote</li>
            <li>• <strong>標點恢復：</strong>使用標點模型後處理（需揭露）</li>
            <li>• <strong>會議摘要：</strong>接入 LLM 產生摘要（需授權）</li>
            <li>• <strong>即時轉錄：</strong>使用 streaming ASR API</li>
            <li>• <strong>多語言：</strong>切換 parakeet-ctc-0.6b-zh-cn 等</li>
            <li>• <strong>搜尋功能：</strong>全文檢索逐字稿內容</li>
          </ul>
          <div className="mt-3 p-2 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
            💡 所有擴充功能需遵循相同的安全及隱私原則。
          </div>
        </div>
      </div>

      {/* Monitoring Checklist */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">📋 定期維護檢查清單</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            '檢查 NVIDIA API Key 有效性',
            '驗證 gRPC 端點連線正常',
            '更新 Python 依賴（每月）',
            '檢查 FFmpeg 版本相容性',
            '清理暫存檔案目錄',
            '審查日誌中的錯誤模式',
            '驗證匯出格式正確性',
            '測試端到端轉錄流程',
            '檢查 .env 檔案安全性',
            '確認 git 未追蹤敏感資訊',
            '評估模型版本更新需求',
            '測試長音訊處理效能',
          ].map((item, i) => (
            <label key={i} className="flex items-center gap-3 p-2 bg-[#0a0a0b] rounded-[14px] cursor-pointer hover:bg-[#121214]">
              <input type="checkbox" className="w-4 h-4 rounded border-white/15" />
              <span className="text-sm text-zinc-300">{item}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">🔍 常見問題排解</h3>
        <div className="space-y-3">
          {[
            {
              q: '錯誤：UNAUTHENTICATED',
              a: '檢查 .env 中的 NVIDIA_API_KEY 是否正確。前往 build.nvidia.com 重新產生 API Key。'
            },
            {
              q: '錯誤：DEADLINE_EXCEEDED',
              a: '音訊過長或網路延遲。減少 SEGMENT_DURATION 或增加 TIMEOUT 設定值。'
            },
            {
              q: 'FFmpeg 找不到',
              a: '確認 FFmpeg 已安裝且在 PATH 中。Windows: winget install Gyan.FFmpeg'
            },
            {
              q: '轉錄結果為空或 [聽不清楚]',
              a: '檢查音訊品質、取樣率是否為 16kHz。確認音訊包含語音內容。'
            },
            {
              q: 'SRT 時間不正確',
              a: 'CTC 模型不原生支援時間戳。目前時間為分段級估算，非字詞級精確時間。'
            },
            {
              q: 'Windows 開啟 TXT 亂碼',
              a: '確認匯出使用 UTF-8 BOM 編碼。使用 VS Code 或 Notepad++ 開啟。'
            },
          ].map((item, i) => (
            <details key={i} className="bg-[#0a0a0b] rounded-[14px] overflow-hidden">
              <summary className="px-4 py-3 text-sm text-white cursor-pointer hover:bg-[#121214]">
                ❓ {item.q}
              </summary>
              <div className="px-4 py-3 text-sm text-zinc-400 border-t border-white/[0.08]">
                💡 {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
