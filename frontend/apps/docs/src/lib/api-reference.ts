/**
 * The public API reference, read from the generated OpenAPI document. Each
 * operation and each shared schema is a page of its own; operations reference
 * schemas by `$ref`, which pages render as links to the schema's page.
 */
import { z } from 'zod';
// Raw text, not a JSON module: typing the whole generated document is needless work.
import publicApiDocument from '../data/public-api.json?raw';
import { fieldRows, jsonSchema, referenceRow, schemaHref, typeOf } from './json-schema';

const media = z.object({ schema: jsonSchema, example: z.unknown().optional() });
const content = z.object({ 'application/json': media.optional() });
const PARAMETER_LOCATIONS = ['path', 'query', 'header'] as const;

export const apiDocument = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        summary: z.string(),
        description: z.string(),
        tags: z.array(z.string()).optional(),
        'x-citeladder-scope': z.string().optional(),
        parameters: z
          .array(
            z.object({
              name: z.string(),
              in: z.enum(PARAMETER_LOCATIONS),
              required: z.boolean().optional(),
              description: z.string().optional(),
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

type ApiDocument = z.infer<typeof apiDocument>;

/**
 * The docs' resources, in sidebar order. The spec's tags are finer than a
 * reader's mental model, so a small tag folds into its parent here.
 */
const RESOURCES: readonly Readonly<{ id: string; label: string; tags: readonly string[] }>[] = [
  { id: 'projects', label: 'Projects', tags: ['projects', 'markets'] },
  { id: 'prompts', label: 'Prompts', tags: ['prompts', 'prompt-sets'] },
  { id: 'topics', label: 'Topics', tags: ['topics'] },
  { id: 'competitors', label: 'Competitors', tags: ['competitors', 'competitor-suggestions'] },
  { id: 'audits', label: 'Audits', tags: ['audits', 'audit-schedules'] },
  { id: 'visibility', label: 'Visibility', tags: ['visibility'] },
  { id: 'site-health', label: 'Site health', tags: ['site-health', 'site-crawls'] },
  { id: 'ai-traffic', label: 'AI traffic', tags: ['ai-traffic'] },
  { id: 'performance', label: 'Performance', tags: ['performance'] },
  { id: 'search-intelligence', label: 'Search intelligence', tags: ['search-intelligence'] },
  { id: 'business-map', label: 'Business map', tags: ['business-map'] },
  { id: 'actions', label: 'Actions', tags: ['actions', 'urls'] },
];

const PARAMETER_TITLES = {
  path: 'Path parameters',
  query: 'Query parameters',
  header: 'Headers',
} as const satisfies Record<(typeof PARAMETER_LOCATIONS)[number], string>;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');

/** The resource an operation's tag belongs to; an unmapped tag is a resource of its own. */
function resourceOf(tag: string) {
  const rank = RESOURCES.findIndex((resource) => resource.tags.includes(tag));
  const found = RESOURCES[rank];
  if (found)
    return {
      id: found.id,
      label: found.label,
      rank: [rank, found.tags.indexOf(tag)],
    };
  return { id: tag, label: tag.replaceAll('-', ' '), rank: [RESOURCES.length, 0] };
}

function bodyOf(body: z.infer<typeof media> | undefined) {
  return body
    ? { type: typeOf(body.schema), rows: fieldRows(body.schema), example: body.example ?? null }
    : null;
}

/** Every public operation, by resource then document order, with its page address. */
export function buildOperations(document: ApiDocument) {
  const operations = Object.entries(document.paths).flatMap(([path, item], pathIndex) =>
    Object.entries(item).map(([method, operation], methodIndex) => {
      const request = operation.requestBody?.content['application/json'];
      const success = Object.entries(operation.responses).find(([status]) =>
        status.startsWith('2'),
      );
      const response = success?.[1].content?.['application/json'];
      const resource = resourceOf(operation.tags?.[0] ?? 'projects');
      return {
        order: [...resource.rank, pathIndex, methodIndex],
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        description: operation.description,
        resource: { id: resource.id, label: resource.label },
        scope: operation['x-citeladder-scope'] ?? null,
        parameters: PARAMETER_LOCATIONS.map((location) => ({
          title: PARAMETER_TITLES[location],
          location,
          rows: (operation.parameters ?? [])
            .filter((parameter) => parameter.in === location)
            .map((parameter) => ({
              ...referenceRow(parameter.name, parameter.schema, parameter.required ?? false),
              description: parameter.description ?? parameter.schema.description,
            })),
        })).filter((group) => group.rows.length > 0),
        request: bodyOf(request),
        response: { status: success?.[0] ?? null, body: bodyOf(response) },
      };
    }),
  );
  operations.sort((a, b) => {
    for (const [index, rank] of a.order.entries()) {
      const difference = rank - (b.order[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  });
  // A page address is the summary's slug, made unique within its resource.
  const taken = new Set<string>();
  return operations.map(({ order: _order, ...operation }) => {
    let slug = slugify(operation.summary);
    if (taken.has(`${operation.resource.id}/${slug}`))
      slug = `${slug}-${slugify(operation.method)}`;
    while (taken.has(`${operation.resource.id}/${slug}`)) slug += '-2';
    taken.add(`${operation.resource.id}/${slug}`);
    return { ...operation, slug, href: `/api/endpoints/${operation.resource.id}/${slug}/` };
  });
}

export type ApiOperation = ReturnType<typeof buildOperations>[number];

/** Operations by resource, in sidebar order. */
export function groupOperations(operations: readonly ApiOperation[]) {
  return [...new Set(operations.map((operation) => operation.resource.id))].map((id) => {
    const members = operations.filter((operation) => operation.resource.id === id);
    return { id, label: members[0]?.resource.label ?? id, operations: members };
  });
}

/** The named schemas operations reference, each with its page address. */
function buildSchemas(document: ApiDocument) {
  return Object.entries(document.components.schemas).map(([name, schema]) => ({
    name,
    description: `The ${name} schema shared by API endpoints.`,
    href: schemaHref(name),
    type: typeOf(schema),
    rows: fieldRows(schema),
  }));
}

const document = apiDocument.parse(JSON.parse(publicApiDocument));

export const API_OPERATIONS = buildOperations(document);
export const API_GROUPS = groupOperations(API_OPERATIONS);
export const API_SCHEMAS = buildSchemas(document);
