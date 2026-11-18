/**
 * The page title and prose of every public operation. The OpenAPI document
 * carries them as `summary` and `description`, and the docs site renders the
 * same text, so an operation is described once. Examples are generated from the
 * schemas (`example.ts`); an entry's `request` or `response` replaces the
 * generated one where the generated value would mislead.
 */
import { readDocs } from './operation-docs-reads.ts';
import { writeDocs } from './operation-docs-writes.ts';

export type OperationDoc = {
  summary: string;
  description: string;
  /** A request body example that replaces the generated one. */
  request?: unknown;
  /** A success response example that replaces the generated one. */
  response?: unknown;
};

const PROJECT_PREFIX = '/v1/projects/{project_id}';

/** The key of an operation: its method and its path below the project, `GET /prompts`. */
export function docKey(method: string, path: string): string {
  const relative =
    path === PROJECT_PREFIX
      ? '/'
      : path.startsWith(`${PROJECT_PREFIX}/`)
        ? path.slice(PROJECT_PREFIX.length)
        : path;
  return `${method.toUpperCase()} ${relative}`;
}

export const OPERATION_DOCS: Readonly<Record<string, OperationDoc>> = {
  ...readDocs,
  ...writeDocs,
};
