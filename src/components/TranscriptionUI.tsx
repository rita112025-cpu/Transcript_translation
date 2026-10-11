import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  TERMINAL_STATUSES,
  createTranscriptionJob,
  fetchModels,
  getTranscriptionJob,
  type JobResponse,
  type JobStatus,
  type ModelInfo,
  type TranscriptionMode,
  type TranscriptionResult,
} from '../services/transcriptApi';
import {
  ExportError,
  buildJson,
  buildSrt,
  buildTxt,
  buildVtt,
  displayTextOf,
  formatHms,
  type EditMap,
} from '../services/transcriptExport';

type ExportFormat = 'txt' | 'srt' | 'vtt' | 'json';

const POLL_INTERVAL_MS = 1000;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.mp4', '.flac', '.ogg'];

function formatSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof ExportError || err instanceof Error) return err.message;
  return '發生未知錯誤';
}

interface ExportFile {
  content: string;
  filename: string;
  mimeType: string;
}

function buildExportFile(
  format: ExportFormat,
  result: TranscriptionResult,
  edits: EditMap,
  now: Date,
): ExportFile {
  switch (format) {
    case 'txt':
      return {
        content: buildTxt(result.segments, edits, false),
        filename: 'transcript.txt',
        mimeType: 'text/plain;charset=utf-8',
      };
    case 'srt':
      return {
        content: buildSrt(result.segments, edits, false),
        filename: 'transcript.srt',
        mimeType: 'text/plain;charset=utf-8',
      };
    case 'vtt':
      return {
        content: buildVtt(result.segments, edits, false),
        filename: 'transcript.vtt',
        mimeType: 'text/vtt;charset=utf-8',
      };
    case 'json':
      return {
        content: JSON.stringify(buildJson(result, edits, now), null, 2),
        filename: 'transcript.json',
        mimeType: 'application/json;charset=utf-8',
      };
  }
}

export default function TranscriptionUI() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [mode, setMode] = useState<TranscriptionMode>('local');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A ref, not state: two clicks in one tick would both see isSubmitting=false.
  const submittingRef = useRef(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('txt');
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<EditMap>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isRunning = job !== null && !TERMINAL_STATUSES.includes(job.status);
  const selectedModel = models.find((m) => m.mode === mode);
  const segments = job?.result?.segments ?? [];

  useEffect(() => {
    let cancelled = false;
    fetchModels()
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await getTranscriptionJob(activeJobId);
        if (cancelled) return;
        setJob(next);
        if (!TERMINAL_STATUSES.includes(next.status)) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    };

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeJobId]);

  const resetResult = () => {
    setActiveJobId(null);
    setJob(null);
    setEdits({});
    setEditingId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError('❌ 不支援的檔案格式。請使用 WAV、MP3、M4A、MP4、FLAC 或 OGG。');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('❌ 檔案超過 500MB 限制。');
      return;
    }

    setAudioFile(file);
    resetResult();
  };

  const handleStart = async () => {
    if (!audioFile) return;
    if (mode === 'cloud' && !consentGiven) {
      setError('⚠️ 雲端模式需先授權資料傳輸。請勾選同意選項。');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    resetResult();
    setIsSubmitting(true);
    try {
      const created = await createTranscriptionJob(audioFile, mode, consentGiven);
      setJob(created);
      setActiveJobId(created.job_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleEdit = (id: number, newText: string) => {
    setEdits((prev) => ({ ...prev, [id]: newText }));
  };

  const handleExport = () => {
    if (!job?.result) return;
    let file: ExportFile;
    try {
      file = buildExportFile(exportFormat, job.result, edits, new Date());
    } catch (err) {
      setError(errorMessage(err));
      return;
    }

    const blob = new Blob(['﻿' + file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const blockedReason = segments.length === 0 && (exportFormat === 'srt' || exportFormat === 'vtt')
    ? '此結果沒有可用的時間戳分段，無法匯出字幕'
    : null;
  const startDisabled = !audioFile || isSubmitting || isRunning || (mode === 'cloud' && !consentGiven);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">🎙️ 轉錄介面</h2>
        <p className="text-gray-400">上傳會議錄音，由後端呼叫 NVIDIA Parakeet-CTC-0.6B-zh-tw 進行語音辨識</p>
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
        {selectedModel && (
          <p className={`text-xs w-full ${selectedModel.configured ? 'text-gray-400' : 'text-yellow-300'}`}>
            {selectedModel.configured ? '✅ ' : '⚠️ '}
            {selectedModel.status_message}
          </p>
        )}
      </div>

      {/* Upload Section */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-white font-semibold mb-4">📂 音訊匯入</h3>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-4xl mb-3">🎵</div>
          <p className="text-gray-300">點擊或拖曳音訊檔案至此</p>
          <p className="text-gray-500 text-sm mt-1">支援 WAV、MP3、M4A、MP4（擷取音訊）、FLAC、OGG（最大 500MB）</p>
        </div>

        {audioFile && (
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{audioFile.name}</p>
                <p className="text-gray-400 text-sm">
                  大小：{formatSize(audioFile.size)} | 時長：
                  {job?.result?.duration_seconds != null
                    ? formatHms(job.result.duration_seconds)
                    : '（轉錄後由音訊實際長度顯示）'}
                </p>
              </div>
              <button
                onClick={() => {
                  setAudioFile(null);
                  resetResult();
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isRunning}
                className="text-red-400 hover:text-red-300 text-sm disabled:text-gray-600"
              >
                ✕ 移除
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
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
                雲端模式會由後端把音訊傳送至您在後端 .env 設定的 NVIDIA 服務端點進行辨識，
                音訊內容將由 NVIDIA 服務處理。請確認您有權授權此資料傳輸。
              </p>
            </div>
          </label>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={startDisabled}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors"
      >
        {isSubmitting || isRunning ? '⏳ 轉錄中...' : '🚀 開始轉錄'}
      </button>

      {/* Real job status: stages from the backend, never a timer */}
      {job && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-300">{job.message}</span>
            <span className="text-emerald-400 text-xs">{job.status}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            {job.status === 'transcribing' && job.progress && job.progress.total_chunks > 0 ? (
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(job.progress.completed_chunks / job.progress.total_chunks) * 100}%` }}
              />
            ) : isRunning ? (
              <div className="bg-emerald-500/70 h-2 rounded-full w-1/3 animate-pulse" />
            ) : job.status === 'completed' ? (
              <div className="bg-emerald-500 h-2 rounded-full w-full" />
            ) : (
              <div className="bg-red-500 h-2 rounded-full w-full" />
            )}
          </div>
          {job.status === 'failed' && (
            <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
              ❌ 轉錄失敗：{job.error}
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {job?.status === 'completed' && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-white font-semibold">📝 逐字稿</h3>
              <span className="text-xs text-gray-400">
                來源：{job.result?.mode === 'cloud' ? '☁️ 雲端 NVIDIA（gRPC）' : '🖥️ 本地 NIM（HTTP）'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRaw}
                  onChange={(e) => setShowRaw(e.target.checked)}
                  className="w-3.5 h-3.5 rounded"
                />
                顯示原始 ASR
              </label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border border-gray-600"
              >
                <option value="txt">TXT</option>
                <option value="srt">SRT</option>
                <option value="vtt">VTT</option>
                <option value="json">JSON</option>
              </select>
              <button
                onClick={handleExport}
                disabled={segments.length === 0 || blockedReason !== null}
                title={blockedReason ?? undefined}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded transition-colors"
              >
                📥 匯出
              </button>
            </div>
          </div>

          {blockedReason && (
            <div className="px-4 py-2 text-xs text-yellow-300 bg-yellow-900/20 border-b border-gray-700">
              ⚠️ {blockedReason}
            </div>
          )}

          {segments.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">
              模型沒有回傳任何文字。音訊可能沒有可辨識的語音，或模型輸出為空。
            </div>
          ) : (
            <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
              {segments.map((seg) => {
                const edited = Object.prototype.hasOwnProperty.call(edits, seg.id);
                return (
                  <div key={seg.id} className="p-4 hover:bg-gray-750 group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-emerald-400 text-xs font-mono">[{formatHms(seg.start)}]</span>
                      <span className="text-gray-500 text-xs">→ [{formatHms(seg.end)}]</span>
                      <span className="text-gray-500 text-xs">| 講者未識別</span>
                      {edited && <span className="text-yellow-400 text-xs">✏️ 已編輯</span>}
                    </div>
                    {editingId === seg.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={displayTextOf(seg, edits)}
                          onChange={(e) => handleEdit(seg.id, e.target.value)}
                          className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm text-white"
                          autoFocus
                        />
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 bg-emerald-600 text-white text-xs rounded"
                        >
                          完成
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-gray-200 text-sm cursor-pointer hover:text-white"
                        onClick={() => setEditingId(seg.id)}
                        title="點擊編輯"
                      >
                        {showRaw ? seg.raw_text : displayTextOf(seg, edits)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-3 bg-gray-900 text-xs text-gray-500 border-t border-gray-700">
            💡 提示：時間戳為各分段在音訊中的實際起訖位置（非逐詞時間戳）。點擊文字可編輯。TXT / SRT / VTT 匯出校正後文字；JSON 同時保留校正文字（text）與原始模型輸出（raw_text）。
          </div>
        </div>
      )}
    </div>
  );
}
