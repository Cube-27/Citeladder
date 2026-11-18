import { describe, expect, it } from 'vitest';
import { apiDocument, buildOperations, groupOperations } from './api-reference';
import { buildSnippets, pythonLiteral } from './api-snippets';

const operation = (summary: string, tag: string, extra: object = {}) => ({
  summary,
  description: `${summary}.`,
  tags: [tag],
  responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } },
  ...extra,
});

const document = apiDocument.parse({
  paths: {
    '/v1/projects/{project_id}/prompt-sets': { get: operation('List prompt sets', 'prompt-sets') },
    '/v1/projects/{project_id}/markets': { get: operation('List markets', 'markets') },
    '/v1/projects': { get: operation('List projects', 'projects') },
    '/v1/projects/{project_id}/prompts': {
      get: operation('List prompts', 'prompts'),
      post: operation('List prompts', 'prompts', {
        'x-citeladder-scope': 'prompts:write',
        parameters: [
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
          {
            name: 'limit',
            in: 'query',
            required: true,
            description: 'Rows per page.',
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object' },
              example: { text: "What's the best CRM?", active: true, parent: null },
            },
          },
        },
      }),
    },
  },
  components: { schemas: {} },
});

describe('API operations', () => {
  const operations = buildOperations(document);

  it('folds small tags into their resource and orders resources, then paths', () => {
    expect(
      groupOperations(operations).map(({ id, operations: members }) => [
        id,
        members.map(({ summary }) => summary),
      ]),
    ).toEqual([
      ['projects', ['List projects', 'List markets']],
      ['prompts', ['List prompts', 'List prompts', 'List prompt sets']],
    ]);
  });

  it('gives operations with the same title distinct page addresses', () => {
    expect(operations.map(({ href }) => href)).toEqual([
      '/api/endpoints/projects/list-projects/',
      '/api/endpoints/projects/list-markets/',
      '/api/endpoints/prompts/list-prompts/',
      '/api/endpoints/prompts/list-prompts-post/',
      '/api/endpoints/prompts/list-prompt-sets/',
    ]);
  });

  it("describes a parameter row from the OpenAPI parameter's description", () => {
    const write = operations.find(({ method }) => method === 'POST');
    expect(
      write?.parameters.flatMap(({ rows }) =>
        rows.map(({ name, description }) => [name, description]),
      ),
    ).toEqual([
      ['limit', 'Rows per page.'],
      ['Idempotency-Key', undefined],
    ]);
  });
});

describe('request snippets', () => {
  const [, , , write] = buildOperations(document);

  it('builds a keyed, authenticated request from the example body', () => {
    if (!write) throw new Error('missing write operation');
    const [curl, javascript, python] = buildSnippets(write);
    expect(curl?.code).toBe(
      [
        'curl -X POST "https://api.citeladder.com/v1/projects/00000000-0000-4000-8000-000000000001/prompts?limit=1" \\',
        '  -H "Authorization: Bearer cl_live_…" \\',
        '  -H "Content-Type: application/json" \\',
        '  -H "Idempotency-Key: 00000000-0000-4000-8000-000000000001" \\',
        `  -d '{"text":"What'\\''s the best CRM?","active":true,"parent":null}'`,
      ].join('\n'),
    );
    expect(javascript?.code).toContain(
      "'Idempotency-Key': '00000000-0000-4000-8000-000000000001',",
    );
    expect(python?.code).toContain('"active": True,');
    expect(python?.code).toContain('"parent": None,');
  });

  it('writes JSON values as Python literals', () => {
    expect(pythonLiteral({ ids: [], on: false, n: 2 }, 0)).toBe(
      '{\n    "ids": [],\n    "on": False,\n    "n": 2,\n}',
    );
  });
});
