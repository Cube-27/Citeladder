/**
 * Route-family fragments, normalized for the parity gate.
 *
 * A family's fragment is its operations (the OpenAPI tag) with every schema
 * inlined. Normalization erases the spellings that differ between Pydantic
 * and zod without changing what a schema accepts or emits, so equal
 * fragments mean the two stacks publish the same contract:
 *
 * - annotations (titles, descriptions, examples) are dropped;
 * - `type: [T, 'null']` becomes Pydantic's `anyOf` spelling, and unions are
 *   flattened and order-insensitive, as are `enum` values;
 * - a property with a default is not required: Pydantic omits it from
 *   `required`, zod's output view lists it, and both always emit it. A
 *   `null` default is then dropped, since Pydantic does not publish one;
 * - zod's redundant spellings are dropped: a `pattern` beside a `format`, the
 *   safe-integer bounds of `z.int()`, `additionalProperties: false` and
 *   `propertyNames: {type: 'string'}`; an open object's
 *   `additionalProperties: {}` is Pydantic's `true`.
 *
 * Only success responses are compared. FastAPI publishes its default 422
 * schema, not the error envelope both stacks actually send; the envelope has
 * its own golden masters.
 */
import type { JsonSchema, OpenApiDocument, OpenApiOperation } from './document.ts';

type NormalizedOperation = {
  parameters: { in: string; name: string; required: boolean; schema: unknown }[];
  requestBody: { required: boolean; content: Record<string, unknown> } | null;
  responses: Record<string, Record<string, unknown>>;
};

/** Operations keyed `METHOD /path`. */
export type NormalizedFragment = Record<string, NormalizedOperation>;

const ANNOTATIONS = new Set([
  '$comment',
  '$id',
  '$schema',
  'deprecated',
  'description',
  'example',
  'examples',
  'readOnly',
  'title',
  'writeOnly',
]);
const COMPONENT_REF = '#/components/schemas/';
const LOCAL_DEF_REF = '#/$defs/';

type Definitions = { components: Record<string, JsonSchema>; defs: Record<string, JsonSchema> };

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON with sorted keys, so structurally equal schemas compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function byCanonical(left: unknown, right: unknown): number {
  const a = canonical(left);
  const b = canonical(right);
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function resolveRef(ref: string, definitions: Definitions): JsonSchema {
  let target: JsonSchema | undefined;
  if (ref.startsWith(COMPONENT_REF))
    target = definitions.components[ref.slice(COMPONENT_REF.length)];
  else if (ref.startsWith(LOCAL_DEF_REF))
    target = definitions.defs[ref.slice(LOCAL_DEF_REF.length)];
  if (!target) throw new Error(`Unresolvable schema reference: ${ref}`);
  return target;
}

function unionMembers(members: unknown[]): unknown[] {
  const flattened = members.flatMap((member) =>
    isObject(member) && Object.keys(member).length === 1 && Array.isArray(member.anyOf)
      ? member.anyOf
      : [member],
  );
  const unique = new Map(flattened.map((member) => [canonical(member), member]));
  return [...unique.values()].sort(byCanonical);
}

function normalizeProperties(schema: JsonSchema): void {
  if (!isObject(schema.properties)) return;
  const properties = schema.properties as Record<string, JsonSchema>;
  const defaulted = new Set(
    Object.keys(properties).filter((name) => 'default' in properties[name]!),
  );
  for (const property of Object.values(properties)) {
    if (property.default === null) delete property.default;
  }
  const required = ((schema.required ?? []) as string[]).filter((name) => !defaulted.has(name));
  if (required.length > 0) schema.required = required.sort();
  else delete schema.required;
}

function dropRedundantSpellings(schema: JsonSchema): void {
  if ('format' in schema) delete schema.pattern;
  if (schema.type === 'integer') {
    if (schema.minimum === Number.MIN_SAFE_INTEGER) delete schema.minimum;
    if (schema.maximum === Number.MAX_SAFE_INTEGER) delete schema.maximum;
  }
  if (schema.additionalProperties === false) delete schema.additionalProperties;
  // An open object: zod spells it `{}`, Pydantic `true`.
  if (
    isObject(schema.additionalProperties) &&
    Object.keys(schema.additionalProperties).length === 0
  ) {
    schema.additionalProperties = true;
  }
  if (canonical(schema.propertyNames) === canonical({ type: 'string' })) {
    delete schema.propertyNames;
  }
}

/** Split `type: [T, 'null']` into Pydantic's `anyOf` spelling. */
function splitTypeArray(schema: JsonSchema): JsonSchema {
  if (!Array.isArray(schema.type)) return schema;
  const { type: types, default: fallback, ...rest } = schema as JsonSchema & { type: string[] };
  const members = types.map((type) => (type === 'null' ? { type } : { ...rest, type }));
  const result: JsonSchema = { anyOf: members };
  if (fallback !== undefined) result.default = fallback;
  return result;
}

function normalizeSchema(node: unknown, definitions: Definitions, seen: Set<string>): unknown {
  if (Array.isArray(node)) return node.map((item) => normalizeSchema(item, definitions, seen));
  if (!isObject(node)) return node;
  if (typeof node.$ref === 'string') {
    const ref = node.$ref;
    // A recursive schema stays a reference at its second visit.
    if (seen.has(ref)) return { $ref: ref };
    const merged: JsonSchema = { ...resolveRef(ref, definitions), ...node };
    delete merged.$ref;
    return normalizeSchema(merged, definitions, new Set([...seen, ref]));
  }
  const source = splitTypeArray(node);
  const schema: JsonSchema = {};
  for (const [key, value] of Object.entries(source)) {
    if (ANNOTATIONS.has(key) || key === '$defs') continue;
    // `properties` maps names to schemas: a property may be called `title`.
    schema[key] =
      key === 'properties' && isObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, property]) => [
              name,
              normalizeSchema(property, definitions, seen),
            ]),
          )
        : normalizeSchema(value, definitions, seen);
  }
  normalizeProperties(schema);
  dropRedundantSpellings(schema);
  if (Array.isArray(schema.enum)) schema.enum = [...schema.enum].sort(byCanonical);
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[key])) schema[key] = unionMembers(schema[key] as unknown[]);
  }
  return schema;
}

function normalizeRoot(schema: unknown, components: Record<string, JsonSchema>): unknown {
  const defs = isObject(schema) && isObject(schema.$defs) ? schema.$defs : {};
  return normalizeSchema(
    schema,
    { components, defs: defs as Record<string, JsonSchema> },
    new Set(),
  );
}

function normalizeContent(
  content: Record<string, { schema: JsonSchema }> | undefined,
  components: Record<string, JsonSchema>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(content ?? {}).map(([mediaType, entry]) => [
      mediaType,
      normalizeRoot(entry.schema, components),
    ]),
  );
}

function isSuccessStatus(status: string): boolean {
  return /^2\d\d$/u.test(status);
}

function normalizeOperation(
  operation: OpenApiOperation,
  components: Record<string, JsonSchema>,
): NormalizedOperation {
  const parameters = (operation.parameters ?? [])
    .map((parameter) => {
      const schema = normalizeRoot(parameter.schema, components) as JsonSchema;
      if (schema.default === null) delete schema.default;
      return {
        in: parameter.in,
        name: parameter.name,
        required: Boolean(parameter.required),
        schema,
      };
    })
    .sort((left, right) => byCanonical([left.in, left.name], [right.in, right.name]));
  const body = operation.requestBody;
  const responses = Object.fromEntries(
    Object.entries(operation.responses)
      .filter(([status]) => isSuccessStatus(status))
      .map(([status, response]) => [status, normalizeContent(response.content, components)]),
  );
  return {
    parameters,
    requestBody: body
      ? { required: Boolean(body.required), content: normalizeContent(body.content, components) }
      : null,
    responses,
  };
}

/** The family's operations, normalized; keys are `METHOD /path`. */
export function familyFragment(document: OpenApiDocument, family: string): NormalizedFragment {
  const components = document.components?.schemas ?? {};
  const fragment: NormalizedFragment = {};
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (operation.tags?.includes(family)) {
        fragment[`${method.toUpperCase()} ${path}`] = normalizeOperation(operation, components);
      }
    }
  }
  return fragment;
}

/** The operations that differ between two fragments, one line each. */
export function fragmentDifferences(
  actual: NormalizedFragment,
  expected: NormalizedFragment,
): string[] {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  return keys.flatMap((key) => {
    if (!(key in actual)) return [`${key} is missing`];
    if (!(key in expected)) return [`${key} is not in the Python fragment`];
    return canonical(actual[key]) === canonical(expected[key]) ? [] : [`${key} differs`];
  });
}
