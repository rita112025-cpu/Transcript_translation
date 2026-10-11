type TestStatus = 'UNIT TEST PASS' | 'INTEGRATION TEST PASS' | 'REAL MODEL INFERENCE PASS' | 'MANUAL TEST REQUIRED' | 'CANNOT VERIFY' | 'NOT IMPLEMENTED';

interface TestCase {
  id: string;
  name: string;
  description: string;
  status: TestStatus;
  command?: string;
  successCriteria: string;
  failureDiagnosis: string;
}

const testCases: TestCase[] = [
  {
    id: 'T01',
    name: '30 秒繁體中文音訊成功轉錄',
    description: '錄製或準備一段 30 秒純繁體中文語音，驗證端到端轉錄流程。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t01_basic_transcription.py',
    successCriteria: '輸出文字為繁體中文，語意與原始語音一致，CER < 20%',
    failureDiagnosis: '檢查 API Key 是否有效、音訊格式是否正確、網路連線是否正常'
  },
  {
    id: 'T02',
    name: '中文與英文混合音訊',
    description: '準備包含中英混合內容的音訊（如技術術語），驗證 code-switching 能力。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t02_code_switching.py',
    successCriteria: '英文專有名詞正確保留，中文部分正確轉錄',
    failureDiagnosis: '確認模型支援 light code-switching，檢查英文片段是否被錯誤轉為中文'
  },
  {
    id: 'T03',
    name: '30 分鐘長音訊分段處理',
    description: '使用 30 分鐘錄音測試 VAD 分段、推論及合併流程。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t03_long_audio_30min.py',
    successCriteria: '分段數量合理，合併後無時間倒退，無重複或漏字',
    failureDiagnosis: '檢查 VAD 分段邏輯、重疊區段處理、記憶體使用量'
  },
  {
    id: 'T04',
    name: '60 分鐘長音訊資源使用測試',
    description: '60 分鐘錄音，監控記憶體、CPU 及網路使用量。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t04_long_audio_60min.py --monitor',
    successCriteria: '記憶體不超過 2GB，無 OOM 錯誤，完成時間合理',
    failureDiagnosis: '檢查分段策略、暫存檔清理、串流處理是否正確'
  },
  {
    id: 'T05',
    name: '無聲音訊',
    description: '提供靜音或極低音量音訊，驗證系統處理能力。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t05_silent_audio.py',
    successCriteria: '系統不崩潰，輸出空逐字稿或標示「無語音內容」',
    failureDiagnosis: '檢查 VAD 是否正確偵測無語音區段，錯誤處理是否完善'
  },
  {
    id: 'T06',
    name: '損壞或無法解碼的音訊',
    description: '提供截斷、損壞或非音訊檔案，驗證錯誤處理。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t06_corrupt_audio.py',
    successCriteria: '系統顯示明確錯誤訊息，不崩潰，不刪除原始檔案',
    failureDiagnosis: '檢查 FFmpeg 錯誤捕獲、magic bytes 驗證邏輯'
  },
  {
    id: 'T07',
    name: 'API Key 缺失或無效',
    description: '移除或提供錯誤的 API Key，驗證錯誤處理。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t07_invalid_api_key.py',
    successCriteria: '系統顯示「API Key 無效」訊息，不崩潰，提示重新設定',
    failureDiagnosis: '檢查 .env 讀取、gRPC authentication 錯誤處理'
  },
  {
    id: 'T08',
    name: '雲端連線中斷',
    description: '模擬網路中斷，驗證重試及錯誤處理機制。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t08_network_failure.py',
    successCriteria: '有限次數重試後顯示明確錯誤，不無限重試付費 API',
    failureDiagnosis: '檢查重試次數限制、逾時設定、錯誤訊息是否清晰'
  },
  {
    id: 'T09',
    name: 'TXT 輸出正常',
    description: '驗證 TXT 匯出格式正確，UTF-8 編碼，Windows 可正確顯示。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t09_txt_export.py',
    successCriteria: '檔案為 UTF-8 編碼，繁體中文正確顯示，時間戳格式正確',
    failureDiagnosis: '檢查 BOM 標記、編碼設定、時間格式'
  },
  {
    id: 'T10',
    name: 'SRT 時間範圍有效且排序正確',
    description: '驗證 SRT 輸出的時間範圍邏輯正確。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t10_srt_export.py',
    successCriteria: 'start < end，各段時間不重疊，格式符合 SRT 規範',
    failureDiagnosis: '檢查時間戳計算、分段合併邏輯'
  },
  {
    id: 'T11',
    name: 'JSON 結構符合定義',
    description: '驗證 JSON 輸出包含所有必要欄位。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t11_json_export.py',
    successCriteria: '包含 segment_id, start, end, speaker, text, source_model, processing_status',
    failureDiagnosis: '檢查 JSON schema 定義、欄位命名一致性'
  },
  {
    id: 'T12',
    name: 'Windows 非系統管理員操作',
    description: '在無管理員權限的 Windows 帳號下執行全部流程。',
    status: 'MANUAL TEST REQUIRED',
    command: '（手動測試）',
    successCriteria: '所有功能正常運作，無需管理員權限',
    failureDiagnosis: '檢查檔案路徑權限、port 綁定、FFmpeg 安裝位置'
  },
  {
    id: 'T13',
    name: '原始 ASR 與人工修正版互不覆寫',
    description: '編輯逐字稿後，驗證原始輸出仍然保留。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t13_original_preserved.py',
    successCriteria: 'original_asr 欄位未被修改，edited text 獨立保存',
    failureDiagnosis: '檢查資料結構、存儲邏輯'
  },
  {
    id: 'T14',
    name: '未取得授權時不得觸發外部音訊傳送',
    description: '在未勾選同意的情況下，驗證系統不傳送音訊。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t14_consent_check.py',
    successCriteria: '未授權時顯示提示，不發起 gRPC 連線',
    failureDiagnosis: '檢查 consent 狀態檢查邏輯'
  },
  {
    id: 'T15',
    name: '長音訊分段合併不得出現時間倒退',
    description: '驗證合併後各段時間嚴格遞增。',
    status: 'CANNOT VERIFY',
    command: 'python tests/test_t15_time_ordering.py',
    successCriteria: 'segments[i].start < segments[i+1].start 對所有 i 成立',
    failureDiagnosis: '檢查分段時間映射、合併排序邏輯'
  },
];

const statusColors: Record<TestStatus, string> = {
  'UNIT TEST PASS': 'bg-green-900/50 text-green-300 border-green-700',
  'INTEGRATION TEST PASS': 'bg-blue-900/50 text-blue-300 border-blue-700',
  'REAL MODEL INFERENCE PASS': 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  'MANUAL TEST REQUIRED': 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  'CANNOT VERIFY': 'bg-[#1a1a1e]/50 text-zinc-300 border-white/15',
  'NOT IMPLEMENTED': 'bg-red-900/50 text-red-300 border-red-700',
};

export default function TestVerification() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">✅ Phase 4：測試及驗收</h2>
        <p className="text-zinc-400">測試案例設計、執行指令及驗收標準。未實際執行的測試不標示 PASS。</p>
      </div>

      {/* Important Notice */}
      <div className="bg-yellow-900/20 border border-yellow-800 rounded-[20px] p-4">
        <p className="text-yellow-300 text-sm">
          ⚠️ <strong>重要聲明：</strong>以下測試案例已設計但尚未在實際環境中執行。所有測試狀態標示為 CANNOT VERIFY，
          表示需要在具備 NVIDIA API Key 及實際音訊檔案的環境中才能驗證。
          沒有實際執行的測試不得標示 PASS。
        </p>
      </div>

      {/* Test Cases Table */}
      <div className="bg-[#121214] rounded-[20px] border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0a0b]">
              <tr>
                <th className="text-left px-3 py-3 text-zinc-300 font-medium w-12">ID</th>
                <th className="text-left px-3 py-3 text-zinc-300 font-medium">測試名稱</th>
                <th className="text-left px-3 py-3 text-zinc-300 font-medium w-40">狀態</th>
                <th className="text-left px-3 py-3 text-zinc-300 font-medium w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {testCases.map((tc) => (
                <tr key={tc.id} className="hover:bg-[#121214]">
                  <td className="px-3 py-3 text-zinc-100 font-mono font-bold">{tc.id}</td>
                  <td className="px-3 py-3">
                    <p className="text-white font-medium text-sm">{tc.name}</p>
                    <p className="text-zinc-400 text-xs mt-0.5">{tc.description}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 rounded text-xs border ${statusColors[tc.status]}`}>
                      {tc.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <details className="text-xs">
                      <summary className="text-blue-400 cursor-pointer hover:text-blue-300">詳情</summary>
                      <div className="mt-2 p-2 bg-[#0a0a0b] rounded space-y-1">
                        {tc.command && <p className="text-zinc-400"><code className="text-zinc-100">{tc.command}</code></p>}
                        <p className="text-green-400">✓ {tc.successCriteria}</p>
                        <p className="text-red-400">✗ {tc.failureDiagnosis}</p>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acceptance Table */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">📋 功能驗收表</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#0a0a0b]">
              <tr>
                <th className="text-left px-4 py-2 text-zinc-300">功能</th>
                <th className="text-left px-4 py-2 text-zinc-300">狀態</th>
                <th className="text-left px-4 py-2 text-zinc-300">驗證方法</th>
                <th className="text-left px-4 py-2 text-zinc-300">限制</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {[
                ['音訊上傳（WAV/MP3/M4A/FLAC）', 'CANNOT VERIFY', '上傳各格式檔案', '最大 500MB'],
                ['音訊格式驗證', 'CANNOT VERIFY', '上傳非音訊檔案', '依賴 magic bytes'],
                ['FFmpeg 格式轉換', 'CANNOT VERIFY', '轉換 MP3 → WAV', '需安裝 FFmpeg'],
                ['NVIDIA 模型推論', 'CANNOT VERIFY', '使用 API Key 轉錄', '需有效 API Key'],
                ['繁體中文轉錄', 'CANNOT VERIFY', '純中文語音測試', 'CER 待實測'],
                ['中英混合轉錄', 'CANNOT VERIFY', '混合語音測試', 'light code-switching'],
                ['時間戳產生', 'CANNOT VERIFY', '檢查輸出格式', '分段級，非字詞級'],
                ['長音訊分段', 'CANNOT VERIFY', '30/60 分鐘錄音', '需 VAD 分段'],
                ['逐字稿編輯', 'CANNOT VERIFY', '修改文字內容', '原始版保留'],
                ['TXT 匯出', 'CANNOT VERIFY', '匯出並開啟', 'UTF-8 BOM'],
                ['SRT 匯出', 'CANNOT VERIFY', '匯出並載入播放器', '需有效時間範圍'],
                ['JSON 匯出', 'CANNOT VERIFY', '驗證結構', '含所有 metadata'],
                ['Windows 非管理員執行', 'MANUAL TEST REQUIRED', '一般帳號測試', '需確認路徑權限'],
                ['隱私保護（localhost）', 'CANNOT VERIFY', '嘗試外部存取', '預設僅本機'],
                ['API Key 安全', 'CANNOT VERIFY', '檢查 .gitignore', '不寫入版本控制'],
              ].map(([func, status, method, limit], i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-white">{func}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs border ${statusColors[status as TestStatus]}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{method}</td>
                  <td className="px-4 py-2 text-zinc-400">{limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CER Evaluation */}
      <div className="bg-[#121214] rounded-[20px] p-6 border border-white/[0.08]">
        <h3 className="text-lg font-semibold text-white mb-4">📊 CER 評估計畫</h3>
        <div className="text-sm text-zinc-300 space-y-3">
          <p>建立小型人工校對資料集（建議 10-20 段，每段 30-60 秒），計算 Character Error Rate：</p>
          <div className="bg-[#0a0a0b] rounded-[14px] p-4 font-mono text-xs">
            <p className="text-zinc-400"># CER 計算公式</p>
            <p className="text-zinc-100">CER = (S + D + I) / N × 100%</p>
            <p className="text-zinc-400 mt-2"># S = 替換錯誤數, D = 刪除錯誤數, I = 插入錯誤數, N = 參考文字總字數</p>
            <p className="text-zinc-400 mt-2"># 建議使用 jiwer 或 editdistance 套件計算</p>
            <p className="text-zinc-100 mt-2">pip install jiwer</p>
            <p className="text-zinc-100">python -c "from jiwer import cer; print(cer('參考文字', 'ASR輸出'))"</p>
          </div>
          <p className="text-yellow-300">⚠️ 實際 CER 數值需使用真實音訊及模型推論結果才能獲得。不得憑空產出準確率數據。</p>
        </div>
      </div>
    </div>
  );
}
