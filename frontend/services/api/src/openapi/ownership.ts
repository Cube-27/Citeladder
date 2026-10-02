/** Every native API family is declared and reaches its owner through ingress. */
import type { OpenApiDocument } from './document.ts';
import type { IngressOutcome } from './ingress.ts';

export type OwnershipInputs = {
  apiPrefix: string;
  manifest: Readonly<Record<string, string>>;
  typescript: OpenApiDocument;
  ingress: Readonly<Record<string, (path: string) => Set<IngressOutcome>>>;
  protocolPaths?: readonly string[];
};

const SAMPLE_SEGMENT = '00000000-0000-4000-8000-000000000000';

export function routeOwnershipFailures(inputs: OwnershipInputs): string[] {
  const failures: string[] = [];
  const families = new Set<string>();
  const paths = new Set<string>(inputs.protocolPaths ?? []);
  for (const [path, item] of Object.entries(inputs.typescript.paths)) {
    if (path !== inputs.apiPrefix && !path.startsWith(`${inputs.apiPrefix}/`)) continue;
    paths.add(path);
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
  for (const [file, route] of Object.entries(inputs.ingress)) {
    for (const path of paths) {
      // The negated class cannot match the closing brace.
      const sample = path.replaceAll(/\{[^}]+\}/gu, SAMPLE_SEGMENT); // NOSONAR
      const reached = [...route(sample)].filter((outcome) => outcome !== 'respond');
      if (reached.length !== 1 || reached[0] !== 'typescript')
        failures.push(
          `${file}: ${path} must reach only typescript, but reaches [${reached.join(', ')}]`,
        );
    }
  }
  return failures;
}
