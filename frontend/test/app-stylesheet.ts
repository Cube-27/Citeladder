import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(import.meta.dirname, '../apps/app/src');

export function appStylesheet() {
  const entry = readFileSync(join(SOURCE, 'globals.css'), 'utf8');
  return [...entry.matchAll(/^@import '\.\/([\w-]+\.css)';$/gmu)]
    .map(([, part = '']) => readFileSync(join(SOURCE, part), 'utf8'))
    .join('\n');
}
