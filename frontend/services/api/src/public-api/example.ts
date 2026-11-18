/**
 * Deterministic example values for the public API document, built from a
 * schema's JSON Schema form. Identifiers are obviously fake UUIDs, URLs sit on
 * `example.com`, and a nullable value shows its non-null variant, so an
 * example never turns an unknown into zero.
 */
import type { JsonSchema } from '../openapi/document.ts';

const REF_PREFIX = '#/components/schemas/';
const MAX_DEPTH = 6;

const STRING_FORMATS: Record<string, string> = {
  'date-time': '2026-01-15T09:30:00.000Z',
  date: '2026-01-15',
  uri: 'https://example.com/page',
  url: 'https://example.com/page',
  email: 'person@example.com',
};

export type ExampleContext = {
  components: Readonly<Record<string, JsonSchema>>;
  io: 'input' | 'output';
};

function nullable(schema: JsonSchema): boolean {
  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  return (
    (Array.isArray(schema.type) && schema.type.includes('null')) ||
    schema.type === 'null' ||
    (variants?.some((variant) => variant.type === 'null') ?? false)
  );
}

/** `00000000-0000-4000-8000-000000000001`, the n-th fake identifier. */
export function fakeUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function exampleOf(schema: JsonSchema, context: ExampleContext): unknown {
  let counter = 0;
  const build = (node: JsonSchema, depth: number, key: string): unknown => {
    if (depth > MAX_DEPTH) return null;
    if (typeof node.$ref === 'string' && node.$ref.startsWith(REF_PREFIX)) {
      const target = context.components[node.$ref.slice(REF_PREFIX.length)];
      return target ? build(target, depth + 1, key) : null;
    }
    if (node.const !== undefined) return node.const;
    if (node.default !== undefined && node.default !== null) return node.default;
    if (Array.isArray(node.enum)) return node.enum[0];
    const variants = (node.anyOf ?? node.oneOf) as JsonSchema[] | undefined;
    if (variants) {
      const first = variants.find((variant) => variant.type !== 'null') ?? variants[0];
      return first ? build(first, depth + 1, key) : null;
    }
    if (Array.isArray(node.allOf))
      return Object.assign(
        {},
        ...(node.allOf as JsonSchema[]).map((part) => build(part, depth + 1, key)),
      );
    const types = Array.isArray(node.type) ? node.type : [node.type];
    const type = types.find((candidate) => candidate !== 'null') ?? types[0];
    switch (type) {
      case 'string': {
        if (node.format === 'uuid') return fakeUuid((counter += 1));
        const format = typeof node.format === 'string' ? STRING_FORMATS[node.format] : undefined;
        if (format) return format;
        if (/(^|_)(url|link)$/.test(key)) return 'https://example.com/page';
        if (/(^|_)domains?$/.test(key)) return 'example.com';
        if (key.endsWith('_at')) return STRING_FORMATS['date-time'];
        return key ? `Example ${key.replaceAll('_', ' ')}` : 'example';
      }
      case 'integer':
      case 'number':
        return typeof node.minimum === 'number' && node.minimum > 0 ? node.minimum : 1;
      case 'boolean':
        return true;
      case 'array':
        return node.items ? [build(node.items as JsonSchema, depth + 1, key)] : [];
      case 'object': {
        const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
        const required = new Set((node.required ?? []) as string[]);
        // A request names only what it must (or one field when nothing is required);
        // a response shows an unknown as null, never as a made-up value.
        const shown = Object.entries(properties).filter(([name], index) =>
          context.io === 'input'
            ? required.has(name) || (required.size === 0 && index === 0)
            : true,
        );
        const entries = shown.map(
          ([name, property]) =>
            [
              name,
              context.io === 'output' && nullable(property)
                ? null
                : build(property, depth + 1, name),
            ] as const,
        );
        if (entries.length === 0 && typeof node.additionalProperties === 'object')
          return { example: build(node.additionalProperties as JsonSchema, depth + 1, key) };
        return Object.fromEntries(entries);
      }
      default:
        return null;
    }
  };
  return build(schema, 0, '');
}
