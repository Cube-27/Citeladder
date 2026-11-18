/**
 * The page title and prose of every public operation. The OpenAPI document
 * carries them as `summary` and `description`, and the docs site renders the
 * same text, so an operation is described once. Examples are generated from the
 * schemas (`example.ts`); `REQUEST_EXAMPLES` replaces a generated request body
 * where the generated one would mislead.
 */
import { OPERATION_TEXT } from './operation-docs-text.ts';

export type OperationDoc = {
  summary: string;
  description: string;
  /** A request body example that replaces the generated one. */
  request?: unknown;
};

const PROJECT_PREFIX = '/v1/projects/{project_id}';
const IDEMPOTENCY_ADVICE =
  ' Send an Idempotency-Key header so a retry within 24 hours never runs it twice.';
const SET_ID = '00000000-0000-4000-8000-000000000001';

/** The key of an operation: its method and its path below the project, `GET /prompts`. */
export function docKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${relativePath(path)}`;
}

function relativePath(path: string): string {
  if (path === PROJECT_PREFIX) return '/';
  if (path.startsWith(`${PROJECT_PREFIX}/`)) return path.slice(PROJECT_PREFIX.length);
  return path;
}

const REQUEST_EXAMPLES: Readonly<Record<string, unknown>> = {
  'POST /audits': { prompt_set_id: SET_ID, engines: ['chatgpt'], max_attempts: 12 },
  'POST /audits/estimate': { prompt_set_id: SET_ID, engines: ['chatgpt'] },
};

export const OPERATION_DOCS: Readonly<Record<string, OperationDoc>> = Object.fromEntries(
  OPERATION_TEXT.trim()
    .split('\n')
    .map((line) => {
      const [key = '', summary = '', description = ''] = line.split(' | ');
      const request = REQUEST_EXAMPLES[key];
      return [
        key,
        {
          summary,
          description: description.replace('{key}', IDEMPOTENCY_ADVICE),
          ...(request === undefined ? {} : { request }),
        },
      ];
    }),
);
