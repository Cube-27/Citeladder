import { z } from 'zod';

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
};

export const jsonSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    $ref: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    format: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
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

const COMPONENT_REF = '#/components/schemas/';

export type TypePart = { text: string; schema?: string };

export type ReferenceRow = {
  name: string;
  type: TypePart[];
  required: boolean;
  description?: string;
  values: string[];
  defaultValue?: string;
};

export const schemaHref = (name: string) => `/api/schemas/${name}/`;

function joined(labels: TypePart[][], separator: string): TypePart[] {
  return labels.flatMap((label, index) => (index === 0 ? label : [{ text: separator }, ...label]));
}

export function typeOf(schema: JsonSchema): TypePart[] {
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

function inlineObject(schema: JsonSchema): JsonSchema | null {
  if (schema.properties) return schema;
  if (schema.items) return inlineObject(schema.items);
  for (const variant of schema.anyOf ?? schema.oneOf ?? []) {
    const found = inlineObject(variant);
    if (found) return found;
  }
  return null;
}

export function referenceRow(name: string, schema: JsonSchema, required: boolean): ReferenceRow {
  const values = schema.enum?.map(String) ?? [];
  const type = values.length ? typeOf({ type: schema.type ?? 'string' }) : typeOf(schema);
  return {
    name,
    type,
    required,
    description: schema.description,
    values,
    defaultValue: schema.default === undefined ? undefined : JSON.stringify(schema.default),
  };
}

export function fieldRows(schema: JsonSchema, prefix = ''): ReferenceRow[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([field, property]) => {
    const name = prefix + field;
    const inline = inlineObject(property);
    return [
      referenceRow(name, property, required.has(field)),
      ...(inline ? fieldRows(inline, `${name}.`) : []),
    ];
  });
}
