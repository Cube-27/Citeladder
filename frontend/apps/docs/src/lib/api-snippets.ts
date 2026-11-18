/**
 * Copyable request examples for one operation in cURL, JavaScript and Python,
 * built from the operation's path, parameters and example body.
 */
import type { ApiOperation } from './api-reference';

export const API_ORIGIN = 'https://api.citeladder.com';
const FAKE_UUID = '00000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = 'Idempotency-Key';

type Snippet = {
  id: 'curl' | 'javascript' | 'python';
  label: string;
  language: string;
  code: string;
};

/** The request line's URL: path parameters filled with a fake id, required query parameters added. */
export function exampleUrl(operation: ApiOperation): string {
  const path = operation.path.replaceAll(/\{[^}]+\}/g, FAKE_UUID);
  const required = operation.parameters
    .filter((group) => group.title === 'Query parameters')
    .flatMap((group) => group.rows.filter((row) => row.required));
  const query = required.map((row) => `${row.name}=${row.values[0] ?? FAKE_UUID}`).join('&');
  return `${API_ORIGIN}${path}${query ? `?${query}` : ''}`;
}

/** A JSON value as a Python literal, indented to sit inside a call. */
export function pythonLiteral(value: unknown, indent: number): string {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value))
    return value.length === 0
      ? '[]'
      : `[\n${value.map((item) => `${pad}    ${pythonLiteral(item, indent + 4)},`).join('\n')}\n${pad}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length === 0
      ? '{}'
      : `{\n${entries
          .map(
            ([key, item]) =>
              `${pad}    ${JSON.stringify(key)}: ${pythonLiteral(item, indent + 4)},`,
          )
          .join('\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

export function buildSnippets(operation: ApiOperation): Snippet[] {
  const url = exampleUrl(operation);
  const body = operation.request?.example;
  const json = body === null || body === undefined ? null : JSON.stringify(body, null, 2);
  const idempotent = operation.parameters.some((group) =>
    group.rows.some((row) => row.name === IDEMPOTENCY_KEY),
  );
  const headers: [string, string][] = [
    ['Authorization', 'Bearer cl_live_…'],
    ...(json ? [['Content-Type', 'application/json'] as [string, string]] : []),
    ...(idempotent ? [[IDEMPOTENCY_KEY, FAKE_UUID] as [string, string]] : []),
  ];
  const method = operation.method;

  const curl = [
    `curl${method === 'GET' ? '' : ` -X ${method}`} "${url}"`,
    ...headers.map(([name, value]) => `-H "${name}: ${value}"`),
    ...(json ? [`-d '${JSON.stringify(body)}'`] : []),
  ].join(' \\\n  ');

  const javascript = [
    `const response = await fetch('${url}', {`,
    `  method: '${method}',`,
    '  headers: {',
    ...headers.map(([name, value]) => `    '${name}': '${value}',`),
    '  },',
    ...(json ? [`  body: JSON.stringify(${json.replaceAll('\n', '\n  ')}),`] : []),
    '});',
    'const data = await response.json();',
  ].join('\n');

  const python = [
    'import requests',
    '',
    'response = requests.request(',
    `    "${method}",`,
    `    "${url}",`,
    '    headers={',
    ...headers.map(([name, value]) => `        "${name}": "${value}",`),
    '    },',
    ...(json ? [`    json=${pythonLiteral(body, 4)},`] : []),
    ')',
    'data = response.json()',
  ].join('\n');

  return [
    { id: 'curl', label: 'cURL', language: 'bash', code: curl },
    { id: 'javascript', label: 'JavaScript', language: 'javascript', code: javascript },
    { id: 'python', label: 'Python', language: 'python', code: python },
  ];
}
