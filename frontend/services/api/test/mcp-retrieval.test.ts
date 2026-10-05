import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { mcpPolicy } from '../src/mcp/config.ts';
import { parseRecordId, retrievalDocument } from '../src/mcp/retrieval.ts';
import { McpInputError } from '../src/mcp/types.ts';

it('returns same-origin links for internal record reads without an HTTP origin', () => {
  const id = randomUUID();
  const record = { status: 'completed', evidence: { missing: ['price'] } };
  const result = retrievalDocument('site_crawl', id, 0, record, 'Crawl', id, null, '');
  expect(result.url).toBe(`/website?project=${id}&evidence=${id}`);
  expect(JSON.parse(String(result.text))).toEqual(record);
});

it.each([mcpPolicy.max_document_bytes, 12000])(
  'bounds complete UTF-8 documents to %i bytes and reassembles Unicode without losing structured evidence',
  (maxBytes) => {
    const id = randomUUID();
    const record = {
      text: '😀漢字'.repeat(mcpPolicy.max_document_bytes / 10),
      unknown: null,
      zero: 0,
    };
    const initial = retrievalDocument(
      'prompt',
      id,
      0,
      record,
      'Prompt',
      id,
      null,
      'https://app.example.test',
      maxBytes,
    );
    const metadata = initial.metadata as { part_uris: string[]; complete: boolean };
    expect(metadata.complete).toBe(false);
    const texts = metadata.part_uris.map((uri) => {
      const parsed = parseRecordId(uri);
      const part = retrievalDocument(
        parsed.kind,
        parsed.id,
        parsed.part,
        record,
        'Prompt',
        id,
        null,
        'https://app.example.test',
        maxBytes,
      );
      expect(Buffer.byteLength(JSON.stringify(part), 'utf8')).toBeLessThanOrEqual(maxBytes);
      return part.text;
    });
    expect(JSON.parse(texts.join(''))).toEqual(record);
    expect(() =>
      retrievalDocument(
        'prompt',
        id,
        metadata.part_uris.length,
        record,
        'Prompt',
        id,
        null,
        'https://app.example.test',
        maxBytes,
      ),
    ).toThrow('not found');
  },
);

it('rejects arbitrary sources and ambiguous continuation parameters', () => {
  const id = randomUUID();
  for (const uri of [
    'https://example.test/file',
    `citeladder://users/${id}`,
    `citeladder://prompt/${id}?part=-1`,
    `citeladder://prompt/${id}?part=0&part=1`,
    `citeladder://prompt/${id}?sql=select`,
    `citeladder://user@prompt/${id}`,
    'not a record uri',
  ])
    expect(() => parseRecordId(uri)).toThrow(McpInputError);
});
