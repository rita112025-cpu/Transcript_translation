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

  const modeOptions: { id: TranscriptionMode; title: string; sub: string; chips: string[] }[] = [
    { id: 'local', title: '本地 NIM', sub: 'HTTP · 本機', chips: ['音訊不離開本機', '需啟動自架 NIM'] },
    { id: 'cloud', title: '雲端 NVIDIA', sub: 'gRPC · 需同意', chips: ['預設停用', '需 API Key'] },
  ];

  const stageLabel = job ? job.status : 'idle';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
      {/* Left: controls */}
      <div className="flex flex-col gap-5">
        <section className="rounded-[24px] bg-[#121214] border border-white/[0.08] p-5 md:p-6 shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold tracking-[0.08em] uppercase font-mono text-zinc-300">模型與模式</h3>
            <span className="text-[11px] text-zinc-500 font-mono">parakeet-ctc-0.6b-zh-tw</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {modeOptions.map((opt) => {
              const selected = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  aria-pressed={selected}
                  className={`text-left rounded-[16px] border p-4 flex items-start gap-3 transition ${
                    selected ? 'bg-white text-black border-white' : 'bg-[#0f0f11] text-zinc-200 border-white/10 hover:border-white/25'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'border-black' : 'border-zinc-500'
                    }`}
                  >
                    {selected && <span className="w-2 h-2 rounded-full bg-black" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium">{opt.title}</span>
                      <span className={`text-[11px] font-mono ${selected ? 'text-zinc-600' : 'text-zinc-500'}`}>{opt.sub}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {opt.chips.map((chip) => (
                        <span
                          key={chip}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                            selected ? 'bg-black/10 text-zinc-800' : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {chip}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {selectedModel && (
            <div
              className={`mt-3 flex gap-2 text-[11px] rounded-xl p-2.5 border ${
                selectedModel.configured
                  ? 'text-zinc-400 bg-white/[0.03] border-white/10'
                  : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
              }`}
            >
              <span>{selectedModel.configured ? '✅' : '⚠️'}</span>
              <span>{selectedModel.status_message}</span>
            </div>
          )}
        </section>

        <section className="rounded-[24px] bg-[#121214] border border-white/[0.08] p-5 md:p-6 shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold tracking-[0.08em] uppercase font-mono text-zinc-300">音訊匯入</h3>
            <span className="text-[11px] text-zinc-500 font-mono">≤ 500MB</span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[16px] border border-dashed border-white/20 bg-[#0f0f11] p-8 text-center cursor-pointer hover:border-white/50 transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto rounded-[14px] bg-white text-black grid place-items-center text-xl">🎵</div>
            <p className="mt-3 text-[14px] font-medium">點擊或拖曳音訊檔案至此</p>
            <p className="mt-1 text-[11px] text-zinc-500 font-mono">WAV · MP3 · M4A · MP4 · FLAC · OGG</p>
          </div>

          {audioFile && (
            <div className="mt-4 rounded-[14px] bg-[#1a1a1e] border border-white/10 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-white/10 grid place-items-center">🎧</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{audioFile.name}</p>
                <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                  {formatSize(audioFile.size)} ·{' '}
                  {job?.result?.duration_seconds != null
                    ? formatHms(job.result.duration_seconds)
                    : '時長轉錄後顯示'}
                </p>
              </div>
              <button
                onClick={() => {
                  setAudioFile(null);
                  resetResult();
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isRunning}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 text-zinc-300 text-xs disabled:opacity-40"
                aria-label="移除音訊"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200">{error}</div>
          )}

          {mode === 'cloud' && audioFile && (
            <label className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 w-4 h-4"
              />
              <span className="text-[12px] text-amber-200 leading-relaxed">
                <span className="font-semibold text-amber-300">⚠️ 資料傳輸授權</span>：雲端模式會由後端把音訊傳送至您在後端 .env
                設定的 NVIDIA 服務端點進行辨識，音訊內容將由 NVIDIA 服務處理。請確認您有權授權此資料傳輸。
              </span>
            </label>
          )}

          <button
            onClick={handleStart}
            disabled={startDisabled}
            className="mt-5 w-full h-12 rounded-full bg-white text-black text-[13px] font-bold uppercase tracking-[0.08em] font-mono hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-500 transition"
          >
            {isSubmitting || isRunning ? '⏳ 轉錄中…' : '🚀 開始轉錄'}
          </button>
        </section>
      </div>

      {/* Right: status and transcript */}
      <div className="flex flex-col gap-5 min-w-0">
        <section className="rounded-[24px] bg-[#121214] border border-white/[0.08] p-5 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold tracking-[0.08em] uppercase font-mono text-zinc-300">任務狀態</h3>
            <span className="px-2.5 py-1 rounded-full bg-[#1a1a1d] border border-white/10 text-[10px] font-mono tracking-[0.08em] uppercase flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : job?.status === 'failed' ? 'bg-red-400' : 'bg-zinc-500'}`} />
              {stageLabel}
            </span>
          </div>
          {job ? (
            <>
              <p className="text-[13px] text-zinc-300">{job.message}</p>
              <div className="mt-3 w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                {job.status === 'transcribing' && job.progress && job.progress.total_chunks > 0 ? (
                  <div
                    className="bg-white h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(job.progress.completed_chunks / job.progress.total_chunks) * 100}%` }}
                  />
                ) : isRunning ? (
                  <div className="bg-white/60 h-1.5 w-1/3 rounded-full animate-pulse" />
                ) : job.status === 'completed' ? (
                  <div className="bg-white h-1.5 w-full rounded-full" />
                ) : (
                  <div className="bg-red-500 h-1.5 w-full rounded-full" />
                )}
              </div>
              {job.status === 'failed' && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[12px] text-red-200">
                  ❌ 轉錄失敗：{job.error}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px] text-zinc-500 font-mono">尚未開始。選擇模式、上傳音訊後按「開始轉錄」。</p>
          )}
        </section>

        {job?.status === 'completed' && (
          <section className="rounded-[24px] bg-[#121214] border border-white/[0.08] overflow-hidden">
            <div className="p-5 md:p-6 border-b border-white/[0.08] flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-[13px] font-bold tracking-[0.08em] uppercase font-mono text-zinc-300">逐字稿</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-zinc-300">
                  來源：{job.result?.mode === 'cloud' ? '雲端 NVIDIA（gRPC）' : '本地 NIM（HTTP）'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRaw}
                    onChange={(e) => setShowRaw(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  原始 ASR
                </label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="bg-[#1a1a1e] text-zinc-200 text-[11px] font-mono rounded-full border border-white/10 px-3 py-1"
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
                  className="px-4 py-1.5 rounded-full bg-white text-black text-[11px] font-bold uppercase tracking-[0.08em] font-mono hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-500"
                >
                  匯出
                </button>
              </div>
            </div>

            {blockedReason && (
              <div className="px-5 py-2 text-[12px] text-amber-300 bg-amber-500/10 border-b border-white/[0.08]">
                ⚠️ {blockedReason}
              </div>
            )}

            {segments.length === 0 ? (
              <div className="p-6 text-[13px] text-zinc-400">
                模型沒有回傳任何文字。音訊可能沒有可辨識的語音，或模型輸出為空。
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] max-h-[520px] overflow-y-auto">
                {segments.map((seg) => {
                  const edited = Object.prototype.hasOwnProperty.call(edits, seg.id);
                  return (
                    <div key={seg.id} className="p-5">
                      <div className="flex items-center gap-2 mb-1.5 font-mono text-[11px] text-zinc-500">
                        <span className="text-zinc-200">[{formatHms(seg.start)}]</span>
                        <span>→ [{formatHms(seg.end)}]</span>
                        <span>| 講者未識別</span>
                        {edited && <span className="text-amber-300 font-sans">✏️ 已編輯</span>}
                      </div>
                      {editingId === seg.id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={displayTextOf(seg, edits)}
                            onChange={(e) => handleEdit(seg.id, e.target.value)}
                            className="flex-1 bg-[#0f0f11] text-zinc-100 border border-white/20 rounded-[10px] px-3 py-1.5 text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 rounded-full bg-white text-black text-xs font-bold"
                          >
                            完成
                          </button>
                        </div>
                      ) : (
                        <p
                          className="text-[14px] leading-relaxed text-zinc-100 cursor-pointer hover:text-white"
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

            <div className="p-3 bg-black/40 text-[11px] text-zinc-500 border-t border-white/[0.08] font-mono">
              時間戳為分段在音訊中的實際起訖位置（非逐詞）。TXT / SRT / VTT 匯出校正後文字；JSON 同時保留 text 與 raw_text。
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
