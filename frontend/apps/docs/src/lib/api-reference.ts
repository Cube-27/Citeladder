/**
 * The public API reference, read from the generated OpenAPI document. Shared
 * shapes are named `components.schemas`; operations reference them by `$ref`,
 * which the page renders as links to the schema's entry.
 */
import { z } from 'zod';
// Raw text, not a JSON module: typing the whole generated document is needless work.
import publicApiDocument from '../data/public-api.json?raw';

type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
};

const jsonSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    $ref: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    format: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    const: z.unknown().optional(),
    items: jsonSchema.optional(),
    anyOf: z.array(jsonSchema).optional(),
    oneOf: z.array(jsonSchema).optional(),
    properties: z.record(z.string(), jsonSchema).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.union([jsonSchema, z.boolean()]).optional(),
  }),
);

const content = z.object({ 'application/json': z.object({ schema: jsonSchema }).optional() });

const apiDocument = z.object({
  paths: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        tags: z.array(z.string()).optional(),
        'x-citeladder-scope': z.string().optional(),
        parameters: z.array(z.object({ name: z.string(), in: z.string() })).optional(),
        requestBody: z.object({ content }).optional(),
        responses: z.record(z.string(), z.object({ content: content.optional() })),
      }),
    ),
  ),
  components: z.object({ schemas: z.record(z.string(), jsonSchema) }),
});

const COMPONENT_REF = '#/components/schemas/';

/** One piece of a rendered type; `schema` names the component it links to. */
export type TypePart = { text: string; schema?: string };
/** An object field; `fields` expands an inline object (or array or nullable of one). */
type Field = { name: string; required: boolean; type: TypePart[]; fields: Field[] };
/** A schema as the page shows it: its type, and its fields when it is an object. */
export type Shape = { type: TypePart[]; fields: Field[] };

/** The anchor of a named schema's entry on the reference page. */
export const schemaAnchor = (name: string) => `schema-${name}`;

function joined(labels: TypePart[][], separator: string): TypePart[] {
  return labels.flatMap((label, index) => (index === 0 ? label : [{ text: separator }, ...label]));
}

function typeOf(schema: JsonSchema): TypePart[] {
  if (schema.$ref?.startsWith(COMPONENT_REF)) {
    const name = schema.$ref.slice(COMPONENT_REF.length);
    return [{ text: name, schema: name }];
  }
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) return joined(variants.map(typeOf), ' | ');
  if (schema.const !== undefined) return [{ text: JSON.stringify(schema.const) }];
  if (schema.enum) return [{ text: schema.enum.map((value) => JSON.stringify(value)).join(' | ') }];
  const types = typeof schema.type === 'string' ? [schema.type] : (schema.type ?? []);
  return joined(
    types.map((type) => {
      if (type === 'array') return [...(schema.items ? typeOf(schema.items) : []), { text: '[]' }];
      if (type === 'object' && typeof schema.additionalProperties === 'object')
        return [{ text: 'map of ' }, ...typeOf(schema.additionalProperties)];
      return [{ text: type === 'string' && schema.format ? `string (${schema.format})` : type }];
    }),
    ' | ',
  );
}

/** The inline object a schema carries, unwrapping arrays and unions; named schemas link instead. */
function inlineObject(schema: JsonSchema): JsonSchema | null {
  if (schema.properties) return schema;
  if (schema.items) return inlineObject(schema.items);
  for (const variant of schema.anyOf ?? schema.oneOf ?? []) {
    const found = inlineObject(variant);
    if (found) return found;
  }
  return null;
}

function fieldsOf(schema: JsonSchema): Field[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, property]) => {
    const inline = inlineObject(property);
    return {
      name,
      required: required.has(name),
      type: typeOf(property),
      fields: inline ? fieldsOf(inline) : [],
    };
  });
}

function shapeOf(schema: JsonSchema): Shape {
  return { type: typeOf(schema), fields: fieldsOf(schema) };
}

const document = apiDocument.parse(JSON.parse(publicApiDocument));

/** Every public operation in document order, with its scope and request and response shapes. */
export const API_OPERATIONS = Object.entries(document.paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, operation]) => {
    const request = operation.requestBody?.content['application/json']?.schema;
    const response = Object.entries(operation.responses).find(([status]) =>
      status.startsWith('2'),
    )?.[1].content?.['application/json']?.schema;
    return {
      method: method.toUpperCase(),
      path,
      group: operation.tags?.[0] ?? 'projects',
      scope: operation['x-citeladder-scope'] ?? null,
      query: (operation.parameters ?? [])
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => parameter.name),
      request: request ? shapeOf(request) : null,
      response: response ? shapeOf(response) : null,
    };
  }),
);

/** The named schemas operations reference, by name. */
export const API_SCHEMAS = Object.entries(document.components.schemas).map(([name, schema]) => ({
  name,
  ...shapeOf(schema),
}));
