export type TranscriptionMode = 'cloud' | 'local';

export type JobStatus =
  | 'queued'
  | 'validating'
  | 'converting'
  | 'transcribing'
  | 'formatting'
  | 'completed'
  | 'failed';

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  speaker: string;
  raw_text: string;
  text: string;
  timestamp_source: 'chunk_window';
}

export interface TranscriptionResult {
  model: string;
  language: string;
  mode: TranscriptionMode;
  source_filename: string;
  text: string;
  segments: TranscriptSegment[];
  duration_seconds: number | null;
  status: 'completed';
}

export interface JobProgress {
  completed_chunks: number;
  total_chunks: number;
}

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  message: string;
  progress: JobProgress | null;
  error: string | null;
  result: TranscriptionResult | null;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  id: string;
  mode: TranscriptionMode;
  display_name: string;
  endpoint: string;
  configured: boolean;
  status_message: string;
  requires_consent: boolean;
}

export const TERMINAL_STATUSES: readonly JobStatus[] = ['completed', 'failed'];

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError('無法連線到後端 API（請確認 start.bat 已啟動後端，預設位址 http://127.0.0.1:8000）', 0);
  }

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }
  return (await response.json()) as T;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail;
    }
  } catch {
    // Non-JSON error body: fall through to the status line.
  }
  return `後端回傳 HTTP ${response.status}`;
}

export function fetchModels(): Promise<ModelInfo[]> {
  return requestJson<ModelInfo[]>('/models');
}

export function createTranscriptionJob(
  file: File,
  mode: TranscriptionMode,
  consent: boolean,
): Promise<JobResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  form.append('consent', String(consent));
  return requestJson<JobResponse>('/transcriptions', { method: 'POST', body: form });
}

export function getTranscriptionJob(jobId: string): Promise<JobResponse> {
  return requestJson<JobResponse>(`/transcriptions/${encodeURIComponent(jobId)}`);
}
