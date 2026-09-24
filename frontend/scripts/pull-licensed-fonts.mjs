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
// artifact of this public repository. The directory must sit inside frontend/.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';

const GH_EXECUTABLE =
  process.platform === 'win32' ? String.raw`C:\Program Files\GitHub CLI\gh.exe` : '/usr/bin/gh';
const repository = 'Cube-27/cube27-fonts';
// Pinned so every deploy ships the same bytes; bump it to adopt a font change.
const revision = 'ca1156f70b5490137afa0910d560702b8cd87191';
const licensedFonts = ['GeneralSans-Variable.woff2', 'InterVariable.woff2'];

const frontendRoot = resolve(import.meta.dirname, '..');
const target = resolve(process.argv[2] ?? join(frontendRoot, 'public', 'fonts'));
const withinFrontend = relative(frontendRoot, target);
if (!withinFrontend || withinFrontend.startsWith('..') || isAbsolute(withinFrontend)) {
  throw new Error(`Font target must be a directory inside ${frontendRoot}: ${target}`);
}
mkdirSync(target, { recursive: true });
for (const name of licensedFonts) {
  const bytes = execFileSync(
    GH_EXECUTABLE,
    [
      'api',
      '-H',
      'Accept: application/vnd.github.raw',
      `repos/${repository}/contents/${name}?ref=${revision}`,
    ],
    { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`${repository}/${name} is not a WOFF2 file.`);
  }
  writeFileSync(join(target, name), bytes);
  console.log(`Pulled ${name} (${bytes.length} bytes).`);
}
const record = `Fonts: ${repository}@${revision} (${licensedFonts.join(', ')})`;
console.log(record);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${record}\n`);
