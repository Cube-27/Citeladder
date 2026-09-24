// Copies the faces CiteLadder uses from the private Cube27 font repository
// into public/fonts, where both Workers pick them up as static assets.
//
// That repository is the single source for every font: some faces there are
// licensed for self-hosting but not redistribution, so no font binary enters
// this public repository. .gitignore excludes public/fonts and check:policy
// rejects a tracked font file. Builds without them (forks, Docker, e2e) still
// render, in the metric-matched fallback faces.
//
// Auth is whatever `gh` resolves: a developer's own login locally, and
// GH_TOKEN (a read-only token scoped to the font repository) in delivery.
//
// Usage: pnpm fonts:pull [directory]. Delivery passes the downloaded build
// output instead, so the faces never enter a (publicly downloadable) Actions
// artifact of this public repository.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repository = 'Cube-27/cube27-fonts';
const licensedFonts = ['GeneralSans-Variable.woff2', 'InterVariable.woff2'];

const target = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'public', 'fonts'));
mkdirSync(target, { recursive: true });
for (const name of licensedFonts) {
  const bytes = execFileSync(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repository}/contents/${name}`],
    { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`${repository}/${name} is not a WOFF2 file.`);
  }
  writeFileSync(join(target, name), bytes);
  console.log(`Pulled ${name} (${bytes.length} bytes).`);
}
