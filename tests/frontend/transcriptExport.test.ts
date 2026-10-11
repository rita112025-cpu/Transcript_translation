// Run with: node --test tests/frontend/
// Uses Node's built-in TypeScript type stripping (Node 22.6+/23.6+). No extra packages.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJson,
  buildSrt,
  buildTxt,
  buildVtt,
  formatClock,
  formatHms,
  joinTexts,
  timelineProblem,
  ExportError,
} from '../../src/services/transcriptExport.ts';
import type { TranscriptSegment, TranscriptionResult } from '../../src/services/transcriptApi.ts';

function seg(id: number, start: number, end: number, raw: string, text = raw): TranscriptSegment {
  return { id, start, end, speaker: '講者未識別', raw_text: raw, text, timestamp_source: 'chunk_window' };
}

const SEGMENTS: TranscriptSegment[] = [
  seg(1, 0, 60, ' 第一段 ', '第一段'),
  seg(2, 60, 120, '第二段'),
  seg(3, 120, 150.5, 'SCADA 系統'),
];

const RESULT: TranscriptionResult = {
  model: 'nvidia/parakeet-ctc-0.6b-zh-tw',
  language: 'zh-TW',
  mode: 'local',
  source_filename: 'meeting.wav',
  text: '第一段第二段SCADA 系統',
  segments: SEGMENTS,
  duration_seconds: 150.5,
  status: 'completed',
};

describe('formatClock / formatHms', () => {
  it('formats SRT and VTT separators correctly', () => {
    assert.equal(formatClock(3661.5, ','), '01:01:01,500');
    assert.equal(formatClock(3661.5, '.'), '01:01:01.500');
    assert.equal(formatHms(3599.9999), '01:00:00');
    assert.equal(formatHms(3599.5), '00:59:59');
  });

  it('rounds milliseconds once, without drift', () => {
    assert.equal(formatClock(0.1 + 0.2, ','), '00:00:00,300');
    assert.equal(formatClock(59.9996, ','), '00:01:00,000');
  });
});

describe('timelineProblem', () => {
  it('accepts an ordered, non-overlapping timeline', () => {
    assert.equal(timelineProblem(SEGMENTS), null);
  });

  it('rejects empty output', () => {
    assert.match(timelineProblem([]) ?? '', /沒有任何/);
  });

  it('rejects end before start', () => {
    assert.match(timelineProblem([seg(1, 10, 5, 'x')]) ?? '', /結束時間/);
  });

  it('rejects overlapping or out-of-order segments', () => {
    assert.match(timelineProblem([seg(1, 0, 10, 'a'), seg(2, 5, 12, 'b')]) ?? '', /重疊或順序錯誤/);
  });

  it('rejects non-finite timestamps', () => {
    assert.match(timelineProblem([seg(1, Number.NaN, 5, 'a')]) ?? '', /有效數值/);
  });
});

describe('SRT / VTT', () => {
  it('builds SRT with sequential indexes and valid arrows', () => {
    const srt = buildSrt(SEGMENTS, {}, false);
    assert.equal(
      srt,
      [
        '1',
        '00:00:00,000 --> 00:01:00,000',
        '講者未識別：第一段',
        '',
        '2',
        '00:01:00,000 --> 00:02:00,000',
        '講者未識別：第二段',
        '',
        '3',
        '00:02:00,000 --> 00:02:30,500',
        '講者未識別：SCADA 系統',
        '',
      ].join('\n'),
    );
  });

  it('refuses SRT when the timeline is invalid', () => {
    assert.throws(() => buildSrt([seg(1, 5, 1, 'x')], {}, false), ExportError);
  });

  it('builds VTT with header and dot separators', () => {
    const vtt = buildVtt(SEGMENTS.slice(0, 1), {}, false);
    assert.ok(vtt.startsWith('WEBVTT\n\n'));
    assert.ok(vtt.includes('00:00:00.000 --> 00:01:00.000'));
  });
});

describe('TXT and edits', () => {
  it('uses display text by default and raw text when requested', () => {
    assert.match(buildTxt(SEGMENTS, {}, false), /\[00:00:00\] 講者未識別：第一段/);
    assert.match(buildTxt(SEGMENTS, {}, true), /講者未識別： 第一段 /);
  });

  it('exports user edits but never alters the raw model text', () => {
    const edited = buildTxt(SEGMENTS, { 2: '已校正的第二段' }, false);
    assert.match(edited, /已校正的第二段/);
    const json = buildJson(RESULT, { 2: '已校正的第二段' }, new Date('2026-01-01T00:00:00Z'));
    assert.equal(json.segments[1].text, '已校正的第二段');
    assert.equal(json.segments[1].raw_text, '第二段');
    assert.equal(json.segments[1].edited, true);
    assert.equal(json.segments[0].edited, false);
  });
});

describe('JSON export', () => {
  it('contains the required fields from the real result', () => {
    const json = buildJson(RESULT, {}, new Date('2026-01-01T00:00:00Z'));
    assert.equal(json.model, 'nvidia/parakeet-ctc-0.6b-zh-tw');
    assert.equal(json.language, 'zh-TW');
    assert.equal(json.source_filename, 'meeting.wav');
    assert.equal(json.duration_seconds, 150.5);
    assert.equal(json.status, 'completed');
    assert.equal(json.segments.length, 3);
    assert.equal(json.export_time, '2026-01-01T00:00:00.000Z');
  });
});

describe('joinTexts', () => {
  it('adds a space only between two ASCII word characters', () => {
    assert.equal(joinTexts(['Cable', 'Tray']), 'Cable Tray');
    assert.equal(joinTexts(['系統', 'EMT']), '系統EMT');
    assert.equal(joinTexts(['', '中文', '']), '中文');
  });
});
