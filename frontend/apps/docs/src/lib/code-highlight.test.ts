import { describe, expect, it } from 'vitest';
import { highlightCode, highlightHtml } from './code-highlight';

const coloured = (code: string, language: Parameters<typeof highlightCode>[1]) =>
  highlightCode(code, language)
    .filter((token) => token.kind)
    .map(({ kind, text }) => `${kind}:${text}`);

describe('API example highlighting', () => {
  it('tells JSON keys from string, number and literal values', () => {
    const json = '{\n  "id": "a-1",\n  "count": -2.5e3,\n  "live": true,\n  "next": null\n}';
    expect(coloured(json, 'json')).toEqual([
      'key:"id"',
      'string:"a-1"',
      'key:"count"',
      'number:-2.5e3',
      'key:"live"',
      'literal:true',
      'key:"next"',
      'literal:null',
    ]);
    expect(
      highlightCode(json, 'json')
        .map((token) => token.text)
        .join(''),
    ).toBe(json);
  });

  it('keeps URLs inside strings and colours each language’s words and comments', () => {
    expect(coloured(`curl "https://x.io/#a" -d '{"a":1}' # note`, 'shell')).toEqual([
      'keyword:curl',
      'string:"https://x.io/#a"',
      `string:'{"a":1}'`,
      'comment:# note',
    ]);
    expect(coloured(String.raw`-d '{"n":"O'\''Brien # x"}'`, 'shell')).toEqual([
      String.raw`string:'{"n":"O'\''Brien # x"}'`,
    ]);
    expect(
      coloured(`const r = await fetch('https://x.io', { method: 'GET' });`, 'javascript'),
    ).toEqual([
      'keyword:const',
      'keyword:await',
      "string:'https://x.io'",
      'key:method',
      "string:'GET'",
    ]);
    expect(coloured('json={"on": True, "n": 3}  # x', 'python')).toEqual([
      'key:"on"',
      'literal:True',
      'key:"n"',
      'number:3',
      'comment:# x',
    ]);
  });

  it('escapes markup in the HTML it emits', () => {
    expect(highlightHtml('{"a": "<b>&"}', 'json')).toBe(
      '{<span class="cl-tok-key">&quot;a&quot;</span>: <span class="cl-tok-string">&quot;&lt;b&gt;&amp;&quot;</span>}',
    );
  });
});
