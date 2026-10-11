import type { TranscriptSegment, TranscriptionResult } from './transcriptApi';

export const UNKNOWN_SPEAKER_LABEL = '講者未識別';
const TIMELINE_TOLERANCE_SECONDS = 0.001;

export type EditMap = Record<number, string>;

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export function displayTextOf(segment: TranscriptSegment, edits: EditMap): string {
  return Object.prototype.hasOwnProperty.call(edits, segment.id) ? edits[segment.id] : segment.text;
}

export function outputTextOf(segment: TranscriptSegment, edits: EditMap, useRaw: boolean): string {
  return useRaw ? segment.raw_text : displayTextOf(segment, edits);
}

export function joinTexts(parts: string[]): string {
  let result = '';
  for (const part of parts) {
    if (!part) continue;
    const prev = result.slice(-1);
    const next = part.charAt(0);
    if (isAsciiWordChar(prev) && isAsciiWordChar(next)) result += ' ';
    result += part;
  }
  return result;
}

function isAsciiWordChar(ch: string): boolean {
  return ch.length === 1 && /[A-Za-z0-9]/.test(ch);
}

/** Formats seconds as HH:MM:SS<sep>mmm. Milliseconds are rounded once to avoid float drift. */
export function formatClock(seconds: number, separator: ',' | '.'): string {
  const { hms, ms } = splitClock(seconds);
  return `${hms}${separator}${pad(ms, 3)}`;
}

/** Formats seconds as HH:MM:SS. */
export function formatHms(seconds: number): string {
  return splitClock(seconds).hms;
}

function splitClock(seconds: number): { hms: string; ms: number } {
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  return { hms: `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}`, ms: totalMs % 1000 };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Returns a human-readable problem with the timeline, or null when it is usable for SRT/VTT. */
export function timelineProblem(segments: TranscriptSegment[]): string | null {
  if (segments.length === 0) return '沒有任何逐字稿分段可匯出';
  let previousEnd = 0;
  for (const segment of segments) {
    if (![segment.start, segment.end].every(Number.isFinite)) {
      return `第 ${segment.id} 段時間戳不是有效數值`;
    }
    if (segment.start < 0 || segment.end <= segment.start) {
      return `第 ${segment.id} 段的結束時間必須晚於開始時間`;
    }
    if (segment.start + TIMELINE_TOLERANCE_SECONDS < previousEnd) {
      return `第 ${segment.id} 段與前一段時間重疊或順序錯誤`;
    }
    previousEnd = segment.end;
  }
  return null;
}

function assertTimeline(segments: TranscriptSegment[]): void {
  const problem = timelineProblem(segments);
  if (problem) throw new ExportError(`無法產生字幕檔：${problem}`);
}

export function buildTxt(segments: TranscriptSegment[], edits: EditMap, useRaw: boolean): string {
  return segments
    .map((s) => `[${formatHms(s.start)}] ${UNKNOWN_SPEAKER_LABEL}：${outputTextOf(s, edits, useRaw)}`)
    .join('\n\n');
}

export function buildSrt(segments: TranscriptSegment[], edits: EditMap, useRaw: boolean): string {
  assertTimeline(segments);
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${formatClock(s.start, ',')} --> ${formatClock(s.end, ',')}\n` +
        `${UNKNOWN_SPEAKER_LABEL}：${outputTextOf(s, edits, useRaw)}\n`,
    )
    .join('\n');
}

export function buildVtt(segments: TranscriptSegment[], edits: EditMap, useRaw: boolean): string {
  assertTimeline(segments);
  const cues = segments.map(
    (s) =>
      `${formatClock(s.start, '.')} --> ${formatClock(s.end, '.')}\n` +
      `${UNKNOWN_SPEAKER_LABEL}：${outputTextOf(s, edits, useRaw)}`,
  );
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

export interface TranscriptJsonExport {
  model: string;
  language: string;
  source_filename: string;
  mode: string;
  text: string;
  raw_text: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    speaker: string;
    text: string;
    raw_text: string;
    edited: boolean;
    timestamp_source: string;
  }>;
  duration_seconds: number | null;
  status: 'completed';
  export_time: string;
}

/** Builds the JSON export from the real result. Edited text is shown in `text`; the model output stays in `raw_text`. */
export function buildJson(result: TranscriptionResult, edits: EditMap, exportTime: Date): TranscriptJsonExport {
  const segments = result.segments.map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    speaker: s.speaker,
    text: displayTextOf(s, edits),
    raw_text: s.raw_text,
    edited: Object.prototype.hasOwnProperty.call(edits, s.id) && edits[s.id] !== s.text,
    timestamp_source: s.timestamp_source,
  }));
  return {
    model: result.model,
    language: result.language,
    source_filename: result.source_filename,
    mode: result.mode,
    text: joinTexts(segments.map((s) => s.text)),
    raw_text: joinTexts(segments.map((s) => s.raw_text)),
    segments,
    duration_seconds: result.duration_seconds,
    status: 'completed',
    export_time: exportTime.toISOString(),
  };
}
