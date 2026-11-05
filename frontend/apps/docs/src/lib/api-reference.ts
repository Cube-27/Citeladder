/**
 * The public API reference, read from the generated OpenAPI document. Shared
 * shapes are named `components.schemas`; operations reference them by `$ref`,
 * which the page renders as links to the schema's entry.
 */
import { z } from 'zod';
// Raw text, not a JSON module: typing the whole generated document is needless work.
import publicApiDocument from '../data/public-api.json?raw';
import { fieldRows, jsonSchema, referenceRow, typeOf } from './json-schema';

const content = z.object({ 'application/json': z.object({ schema: jsonSchema }).optional() });
const PARAMETER_LOCATIONS = ['path', 'query', 'header'] as const;

const apiDocument = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        tags: z.array(z.string()).optional(),
        'x-citeladder-scope': z.string().optional(),
        parameters: z
          .array(
            z.object({
              name: z.string(),
              in: z.enum(PARAMETER_LOCATIONS),
              required: z.boolean().optional(),
              schema: jsonSchema,
            }),
          )
          .optional(),
        requestBody: z.object({ content }).optional(),
        responses: z.record(z.string(), z.object({ content: content.optional() })),
      }),
    ),
  ),
  components: z.object({ schemas: z.record(z.string(), jsonSchema) }),
});

const PARAMETER_TITLES = {
  path: 'Path parameters',
  query: 'Query parameters',
  header: 'Headers',
} as const satisfies Record<(typeof PARAMETER_LOCATIONS)[number], string>;

const document = apiDocument.parse(JSON.parse(publicApiDocument));

/** The anchor of one operation on the reference page. */
const operationAnchor = (method: string, path: string) =>
  `${method}-${path}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

/** Every public operation in document order, with its scope, parameters and body shapes. */
export const API_OPERATIONS = Object.entries(document.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, operation]) => {
    const request = operation.requestBody?.content['application/json']?.schema;
    const success = Object.entries(operation.responses).find(([status]) => status.startsWith('2'));
    const response = success?.[1].content?.['application/json']?.schema;
    const parameters = operation.parameters ?? [];
    return {
      id: operationAnchor(method, path),
      method: method.toUpperCase(),
      path,
      group: operation.tags?.[0] ?? 'projects',
      scope: operation['x-citeladder-scope'] ?? null,
      parameters: PARAMETER_LOCATIONS.map((location) => ({
        title: PARAMETER_TITLES[location],
        rows: parameters
          .filter((parameter) => parameter.in === location)
          .map((parameter) =>
            referenceRow(parameter.name, parameter.schema, parameter.required ?? false),
          ),
      })).filter((group) => group.rows.length > 0),
      request: request ? { type: typeOf(request), rows: fieldRows(request) } : null,
      response: {
        status: success?.[0] ?? null,
        body: response ? { type: typeOf(response), rows: fieldRows(response) } : null,
      },
    };
  }),
);

export type ApiOperation = (typeof API_OPERATIONS)[number];

/** Operations by resource, in the order each resource first appears. */
export const API_GROUPS = [...new Set(API_OPERATIONS.map((operation) => operation.group))].map(
  (group) => ({
    group,
    operations: API_OPERATIONS.filter((operation) => operation.group === group),
  }),
);

/** The named schemas operations reference, by name. */
export const API_SCHEMAS = Object.entries(document.components.schemas).map(([name, schema]) => ({
  name,
  type: typeOf(schema),
  rows: fieldRows(schema),
}));
