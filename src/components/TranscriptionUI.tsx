import { useState, useRef } from 'react';

interface TranscriptSegment {
  id: number;
  start: string;
  end: string;
  speaker: string;
  text: string;
  original: string;
  status: 'transcribed' | 'unclear' | 'edited';
}

export default function TranscriptionUI() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioInfo, setAudioInfo] = useState<{ name: string; size: string; duration: string } | null>(null);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [showOriginal, setShowOriginal] = useState(true);
  const [exportFormat, setExportFormat] = useState<'txt' | 'srt' | 'json'>('txt');
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/ogg'];
    const validExts = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setError('❌ 不支援的檔案格式。請使用 WAV、MP3、M4A、FLAC 或 OGG。');
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError('❌ 檔案超過 500MB 限制。');
      return;
    }

    setAudioFile(file);
    setAudioInfo({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      duration: '（載入後顯示）'
    });
    setSegments([]);
  };

  const simulateTranscription = () => {
    if (!audioFile) return;
    if (mode === 'cloud' && !consentGiven) {
      setError('⚠️ 雲端模式需先授權資料傳輸。請勾選同意選項。');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError('');
    setSegments([]);

    const steps = [
      { progress: 10, msg: '🔍 驗證音訊格式...' },
      { progress: 20, msg: '🔄 FFmpeg 轉換為 16kHz Mono WAV...' },
      { progress: 30, msg: '📊 分析音訊長度，決定分段策略...' },
      { progress: 40, msg: '🔊 VAD 語音活動偵測...' },
      { progress: 50, msg: '🤖 連接 NVIDIA NIM Cloud API...' },
      { progress: 60, msg: '🧠 推論中：Parakeet-CTC-0.6B-zh-tw...' },
      { progress: 70, msg: '📝 合併分段結果...' },
      { progress: 80, msg: '⏱️ 產生時間戳...' },
      { progress: 90, msg: '✨ 後處理（標點、格式化）...' },
      { progress: 100, msg: '✅ 轉錄完成！' },
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i].progress);
        setProgressMsg(steps[i].msg);
        i++;
      } else {
        clearInterval(interval);
        setIsProcessing(false);
        // Generate demo segments
        setSegments([
          { id: 1, start: '00:00:00', end: '00:00:15', speaker: '未識別', text: '各位同事大家好，今天我們來討論一下第三季的專案進度。', original: '各位同事大家好 今天我們來討論一下第三季的專案進度', status: 'transcribed' },
          { id: 2, start: '00:00:15', end: '00:00:32', speaker: '未識別', text: '好的，我先報告一下前端開發的狀況。目前 React 元件已經完成百分之八十。', original: '好的 我先報告一下前端開發的狀況 目前 React 元件已經完成百分之八十', status: 'transcribed' },
          { id: 3, start: '00:00:32', end: '00:00:48', speaker: '未識別', text: '後端 API 的部分，FastAPI 的 endpoint 都已經部署到 staging 環境了。', original: '後端 API 的部分 FastAPI 的 endpoint 都已經部署到 staging 環境了', status: 'transcribed' },
          { id: 4, start: '00:00:48', end: '00:01:05', speaker: '未識別', text: '[聽不清楚] ...測試的部分還在進行中。', original: '[聽不清楚] 測試的部分還在進行中', status: 'unclear' },
          { id: 5, start: '00:01:05', end: '00:01:22', speaker: '未識別', text: '那我們預計下週五之前可以完成所有的整合測試。', original: '那我們預計下週五之前可以完成所有的整合測試', status: 'transcribed' },
        ]);
      }
    }, 600);
  };

  const handleEdit = (id: number, newText: string) => {
    setSegments(prev => prev.map(s =>
      s.id === id ? { ...s, text: newText, status: 'edited' as const } : s
    ));
  };

  const handleExport = () => {
    let content = '';
    let filename = '';
    let mimeType = '';

    switch (exportFormat) {
      case 'txt':
        content = segments.map(s => `[${s.start}] ${s.speaker}：${showOriginal ? s.original : s.text}`).join('\n\n');
        filename = 'transcript.txt';
        mimeType = 'text/plain;charset=utf-8';
        break;
      case 'srt':
        content = segments.map((s, i) => {
          const startSec = timeToSeconds(s.start);
          const endSec = timeToSeconds(s.end);
          return `${i + 1}\n${formatSRTTime(startSec)} --> ${formatSRTTime(endSec)}\n${s.speaker}：${s.text}\n`;
        }).join('\n');
        filename = 'transcript.srt';
        mimeType = 'text/plain;charset=utf-8';
        break;
      case 'json':
        content = JSON.stringify({
          metadata: {
            source_file: audioFile?.name,
            model: 'parakeet-ctc-0.6b-zh-tw',
            export_time: new Date().toISOString(),
            mode: mode
          },
          segments: segments.map(s => ({
            segment_id: s.id,
            start: s.start,
            end: s.end,
            speaker: s.speaker,
            text: s.text,
            original_asr: s.original,
            source_model: 'parakeet-ctc-0.6b-zh-tw',
            processing_status: s.status
          }))
        }, null, 2);
        filename = 'transcript.json';
        mimeType = 'application/json;charset=utf-8';
        break;
    }

    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">🎙️ 轉錄介面</h2>
        <p className="text-gray-400">上傳會議錄音，使用 NVIDIA Parakeet-CTC-0.6B-zh-tw 進行語音辨識</p>
      </div>

      {/* Model Info */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">模型：</span>
          <span className="px-2 py-1 bg-emerald-900/50 text-emerald-300 text-xs rounded border border-emerald-700">
            parakeet-ctc-0.6b-zh-tw
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">推論模式：</span>
          <div className="flex gap-1">
            <button
              onClick={() => setMode('cloud')}
              className={`px-3 py-1 text-xs rounded ${mode === 'cloud' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              ☁️ 雲端 API
            </button>
            <button
              onClick={() => setMode('local')}
              className={`px-3 py-1 text-xs rounded ${mode === 'local' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              🖥️ 本地 NIM
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">語言：</span>
          <span className="text-xs text-gray-300">台灣華語 (zh-TW) + 中英混合</span>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white font-semibold mb-4">📂 音訊匯入</h3>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <input ref={fileInputRef} type="file" accept=".wav,.mp3,.m4a,.flac,.ogg" onChange={handleFileSelect} className="hidden" />
          <div className="text-4xl mb-3">🎵</div>
          <p className="text-gray-300">點擊或拖曳音訊檔案至此</p>
          <p className="text-gray-500 text-sm mt-1">支援 WAV、MP3、M4A、FLAC、OGG（最大 500MB）</p>
        </div>

        {audioInfo && (
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{audioInfo.name}</p>
                <p className="text-gray-400 text-sm">大小：{audioInfo.size} | 時長：{audioInfo.duration}</p>
              </div>
              <button onClick={() => { setAudioFile(null); setAudioInfo(null); setSegments([]); }} className="text-red-400 hover:text-red-300 text-sm">
                ✕ 移除
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Consent & Start */}
      {mode === 'cloud' && audioFile && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-600"
            />
            <div className="text-sm">
              <p className="text-yellow-300 font-medium">⚠️ 資料傳輸授權</p>
              <p className="text-gray-400 mt-1">
                雲端模式將音訊經加密連線傳輸至 NVIDIA DGX Cloud（grpc.nvcf.nvidia.com）進行推論。
                音訊內容將由 NVIDIA 伺服器處理。請確認您有權授權此資料傳輸。
              </p>
            </div>
          </label>
        </div>
      )}

      <button
        onClick={simulateTranscription}
        disabled={!audioFile || isProcessing || (mode === 'cloud' && !consentGiven)}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors"
      >
        {isProcessing ? '⏳ 轉錄中...' : '🚀 開始轉錄'}
      </button>

      {/* Progress */}
      {isProcessing && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-300">{progressMsg}</span>
            <span className="text-emerald-400">{progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Transcript */}
      {segments.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-white font-semibold">📝 逐字稿</h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOriginal}
                  onChange={(e) => setShowOriginal(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                顯示原始 ASR
              </label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'txt' | 'srt' | 'json')}
                className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
              >
                <option value="txt">TXT</option>
                <option value="srt">SRT</option>
                <option value="json">JSON</option>
              </select>
              <button onClick={handleExport} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors">
                📥 匯出
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
            {segments.map((seg) => (
              <div key={seg.id} className="p-4 hover:bg-gray-750 group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-emerald-400 text-xs font-mono">[{seg.start}]</span>
                  <span className="text-gray-500 text-xs">→ [{seg.end}]</span>
                  <span className="text-gray-500 text-xs">| {seg.speaker}</span>
                  {seg.status === 'edited' && <span className="text-yellow-400 text-xs">✏️ 已編輯</span>}
                  {seg.status === 'unclear' && <span className="text-red-400 text-xs">⚠️ 部分不清</span>}
                </div>
                {editingId === seg.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={seg.text}
                      onChange={(e) => handleEdit(seg.id, e.target.value)}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm text-white"
                      autoFocus
                    />
                    <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-emerald-600 text-white text-xs rounded">
                      完成
                    </button>
                  </div>
                ) : (
                  <p
                    className="text-gray-200 text-sm cursor-pointer hover:text-white"
                    onClick={() => setEditingId(seg.id)}
                    title="點擊編輯"
                  >
                    {showOriginal ? seg.original : seg.text}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-gray-900 text-xs text-gray-500 border-t border-gray-700">
            💡 提示：點擊文字可進行編輯。原始 ASR 輸出與校正版獨立保存，不會互相覆寫。
          </div>
        </div>
      )}
    </div>
  );
}

function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
