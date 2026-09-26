import { describe, expect, it } from 'vite-plus/test';

import { toCsvForTest } from '@/lib/csv/download';

import {
  PROMPT_CSV_COLUMNS,
  PROMPT_CSV_SAMPLE_ROWS,
  parsePromptCsv,
  tokenizeCsv,
  validRows,
} from './csv';

describe('tokenizeCsv', () => {
  it('handles quoted fields, escaped quotes, and embedded newlines', () => {
    const raw = 'text,theme\n"Hello, ""world""","multi\nline"\n';
    expect(tokenizeCsv(raw)).toEqual([
      ['text', 'theme'],
      ['Hello, "world"', 'multi\nline'],
    ]);
  });

  it('strips a BOM and drops blank lines', () => {
    const raw = '﻿text\n\nfoo\n';
    expect(tokenizeCsv(raw)).toEqual([['text'], ['foo']]);
  });
});

describe('parsePromptCsv', () => {
  it('round-trips the downloadable sample through the parser', () => {
    const parsed = parsePromptCsv(`﻿${toCsvForTest(PROMPT_CSV_COLUMNS, PROMPT_CSV_SAMPLE_ROWS)}`);
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(validRows(parsed).map((row) => [row.topic, row.text])).toEqual(PROMPT_CSV_SAMPLE_ROWS);
  });

  it('accepts topic and prompt alone, in any order, with internal defaults', () => {
    const parsed = parsePromptCsv('prompt,topic\nBest shoes?,Running shoes');
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].input).toEqual({
      text: 'Best shoes?',
      topic: 'Running shoes',
      theme: '',
      intent: '',
      cohort: 'core',
      enabled: true,
    });
  });

  it('never rejects a row for its internal columns', () => {
    const parsed = parsePromptCsv(
      `question,category,intent,cohort,theme\nBest shoes?,,frobnicate,weird,${'t'.repeat(300)}`,
    );
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].input).toMatchObject({ topic: '', intent: '', cohort: 'core' });
    expect(parsed.rows[0].input.theme).toHaveLength(255);
  });

  it('treats a file without a recognized header as a list of prompts', () => {
    const parsed = parsePromptCsv('Best shoes?,Running shoes');
    expect(parsed.hasHeader).toBe(false);
    expect(parsed.rows[0].input).toMatchObject({ text: 'Best shoes?', topic: '' });
  });

  it('flags rows the server would refuse and drops them', () => {
    // Lengths are code points, as the server counts them: 255 emoji fit.
    const parsed = parsePromptCsv(
      `topic,prompt\nShoes,\n${'x'.repeat(256)},Fit?\nShoes,${'p'.repeat(301)}\n${'😀'.repeat(255)},Good`,
    );
    expect(parsed.rows.map((row) => row.errors.length > 0)).toEqual([true, true, true, false]);
    expect(validRows(parsed).map((row) => row.text)).toEqual(['Good']);
  });

  it('reports a file-level error for an empty file', () => {
    expect(parsePromptCsv('').errors.length).toBeGreaterThan(0);
  });
});
