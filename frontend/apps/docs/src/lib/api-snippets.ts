import type { ApiOperation } from './api-reference';
import type { CodeLanguage } from './code-highlight';

const API_ORIGIN = 'https://api.citeladder.com';
const FAKE_UUID = '00000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = 'Idempotency-Key';

type Snippet = {
  id: 'curl' | 'javascript' | 'python';
  label: string;
  language: CodeLanguage;
  code: string;
};

function queryExample(row: ApiOperation['parameters'][number]['rows'][number]): string {
  if (row.values[0] !== undefined) return row.values[0];
  const type = row.type.map((part) => part.text).join(' ');
  if (/integer|number/.test(type)) return '1';
  if (type.includes('boolean')) return 'true';
  if (type.includes('uuid')) return FAKE_UUID;
  return 'example';
}

function exampleUrl(operation: ApiOperation): string {
  const path = operation.path.replaceAll(/\{[^{}]+\}/g, FAKE_UUID);
  const required = operation.parameters
    .filter((group) => group.title === 'Query parameters')
    .flatMap((group) => group.rows.filter((row) => row.required));
  const query = required.map((row) => `${row.name}=${queryExample(row)}`).join('&');
  const search = query ? `?${query}` : '';
  return `${API_ORIGIN}${path}${search}`;
}

export function pythonLiteral(value: unknown, indent: number): string {
  const pad = ' '.repeat(indent);
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) {
    const lines = value.map((item) => `${pad}    ${pythonLiteral(item, indent + 4)},`);
    return value.length === 0 ? '[]' : ['[', ...lines, `${pad}]`].join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const lines = entries.map(
      ([key, item]) => `${pad}    ${JSON.stringify(key)}: ${pythonLiteral(item, indent + 4)},`,
    );
    return entries.length === 0 ? '{}' : ['{', ...lines, `${pad}}`].join('\n');
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
  const headers: [string, string][] = [['Authorization', 'Bearer cl_live_…']];
  if (json) headers.push(['Content-Type', 'application/json']);
  if (idempotent) headers.push([IDEMPOTENCY_KEY, FAKE_UUID]);
  const method = operation.method;

  const verb = method === 'GET' ? '' : ` -X ${method}`;
  const shellBody = json && JSON.stringify(body).replaceAll("'", String.raw`'\''`);
  const curl = [
    `curl${verb} "${url}"`,
    ...headers.map(([name, value]) => `-H "${name}: ${value}"`),
    ...(shellBody ? [`-d '${shellBody}'`] : []),
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
    { id: 'curl', label: 'cURL', language: 'shell', code: curl },
    { id: 'javascript', label: 'JavaScript', language: 'javascript', code: javascript },
    { id: 'python', label: 'Python', language: 'python', code: python },
  ];
}
