/** Every API operation carries one declared route family, and every family is served. */
import type { OpenApiDocument } from './document.ts';
import { onlyOf } from '../lists.ts';

export type OwnershipInputs = {
  /** The browser API and API-host machine prefixes. */
  prefixes: readonly string[];
  manifest: Readonly<Record<string, string>>;
  typescript: OpenApiDocument;
};

export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const families = new Set<string>();
  for (const [path, item] of Object.entries(inputs.typescript.paths)) {
    if (!inputs.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))
      continue;
    for (const [method, operation] of Object.entries(item)) {
      const family = onlyOf(new Set(operation.tags ?? []));
      if (family === undefined) {
        failures.push(`${method.toUpperCase()} ${path} must carry exactly one family tag`);
        continue;
      }
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
