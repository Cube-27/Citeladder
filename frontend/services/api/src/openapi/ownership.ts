/** Every native API operation carries one declared route family, and every family is served. */
import type { OpenApiDocument } from './document.ts';

export type OwnershipInputs = {
  apiPrefix: string;
  manifest: Readonly<Record<string, string>>;
  typescript: OpenApiDocument;
};

export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const families = new Set<string>();
  for (const [path, item] of Object.entries(inputs.typescript.paths)) {
    if (path !== inputs.apiPrefix && !path.startsWith(`${inputs.apiPrefix}/`)) continue;
    for (const [method, operation] of Object.entries(item)) {
      const tags = [...new Set(operation.tags ?? [])];
      if (tags.length !== 1) {
        failures.push(`${method.toUpperCase()} ${path} must carry exactly one family tag`);
        continue;
      }
      const family = tags[0]!;
      families.add(family);
      if (inputs.manifest[family] !== 'typescript')
        failures.push(
          `The TypeScript service serves '${family}', which the manifest assigns to ${inputs.manifest[family] ?? 'no stack'}`,
        );
    }
  }
  for (const [family, stack] of Object.entries(inputs.manifest)) {
    if (stack !== 'typescript') failures.push(`'${family}' must be TypeScript-owned`);
    if (!families.has(family)) failures.push(`'${family}' has no declared route`);
  }
  return failures;
}
