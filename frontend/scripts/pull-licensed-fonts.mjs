import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

// An absolute path, not PATH lookup: a PATH entry cannot substitute gh (Sonar S4036).
const GH_EXECUTABLE = '/usr/bin/gh';
const frontendRoot = resolve(import.meta.dirname, '..');
const configPath = join(frontendRoot, 'lib', 'config', 'brand-fonts.json');

const ARIAL_X_HEIGHT = 0.519;
const COURIER_ADVANCE = 0.6;
const WEIGHT_CEILING = 600;
const WEIGHT_FLOOR = 300;

const args = process.argv.slice(2);
const latest = args.includes('--latest');
const target = resolve(
  args.find((arg) => !arg.startsWith('--')) ?? join(frontendRoot, 'public', 'fonts'),
);
const withinFrontend = relative(frontendRoot, target);
if (!withinFrontend || withinFrontend.startsWith('..') || isAbsolute(withinFrontend)) {
  throw new Error(`Font target must be a directory inside ${frontendRoot}: ${target}`);
}

function gh(path, accept) {
  return execFileSync(GH_EXECUTABLE, ['api', '-H', `Accept: ${accept}`, path], {
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function base128(bytes, offset) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = bytes[offset + index];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, offset + index + 1];
  }
  throw new Error('Malformed WOFF2 integer.');
}

function woff2Tables(bytes) {
  // The WOFF2 known-tag table, in specification order; 63 means an explicit tag.
  const KNOWN = [
    'cmap',
    'head',
    'hhea',
    'hmtx',
    'maxp',
    'name',
    'OS/2',
    'post',
    'cvt ',
    'fpgm',
    'glyf',
    'loca',
    'prep',
    'CFF ',
    'VORG',
    'EBDT',
    'EBLC',
    'gasp',
    'hdmx',
    'kern',
    'LTSH',
    'PCLT',
    'VDMX',
    'vhea',
    'vmtx',
    'BASE',
    'GDEF',
    'GPOS',
    'GSUB',
    'EBSC',
    'JSTF',
    'MATH',
    'CBDT',
    'CBLC',
    'COLR',
    'CPAL',
    'SVG ',
    'sbix',
    'acnt',
    'avar',
    'bdat',
    'bloc',
    'bsln',
    'cvar',
    'fdsc',
    'feat',
    'fmtx',
    'fvar',
    'gvar',
    'hsty',
    'just',
    'lcar',
    'mort',
    'morx',
    'opbd',
    'prop',
    'trak',
    'Zapf',
    'Silf',
    'Glat',
    'Gloc',
    'Feat',
    'Sill',
  ];
  const numTables = bytes.readUInt16BE(12);
  const compressedLength = bytes.readUInt32BE(20);
  let offset = 48;
  const entries = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = bytes[offset];
    offset += 1;
    let tag = KNOWN[flags & 0x3f] ?? '';
    if ((flags & 0x3f) === 63) {
      tag = bytes.toString('latin1', offset, offset + 4);
      offset += 4;
    }
    let length;
    [length, offset] = base128(bytes, offset);
    const version = flags >> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    if (transformed) [length, offset] = base128(bytes, offset);
    entries.push({ tag, length });
  }
  const data = brotliDecompressSync(bytes.subarray(offset, offset + compressedLength));
  const tables = new Map();
  let position = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, data.subarray(position, position + length));
    position += length;
  }
  return tables;
}

const percent = (value) => `${Math.round(value * 10000) / 100}%`;

function weightRange(fvar, os2) {
  if (!fvar) return String(os2.readUInt16BE(4));
  const axesOffset = fvar.readUInt16BE(4);
  const axisCount = fvar.readUInt16BE(8);
  const axisSize = fvar.readUInt16BE(10);
  for (let index = 0; index < axisCount; index += 1) {
    const axis = axesOffset + index * axisSize;
    if (fvar.toString('latin1', axis, axis + 4) !== 'wght') continue;
    const minimum = Math.round(fvar.readInt32BE(axis + 4) / 65536);
    const maximum = Math.round(fvar.readInt32BE(axis + 12) / 65536);
    return `${Math.max(minimum, WEIGHT_FLOOR)} ${Math.min(maximum, WEIGHT_CEILING)}`;
  }
  throw new Error('A variable face without a weight axis is not supported.');
}

function derivedFields(role, bytes) {
  if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error('Not a WOFF2 file.');
  const tables = woff2Tables(bytes);
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const os2 = tables.get('OS/2');
  if (!head || !hhea || !os2) throw new Error('The face lacks head, hhea or OS/2.');
  const unitsPerEm = head.readUInt16BE(18);
  const scale =
    role === 'mono'
      ? os2.readInt16BE(2) / unitsPerEm / COURIER_ADVANCE
      : os2.readInt16BE(86) / unitsPerEm / ARIAL_X_HEIGHT;
  const metric = (value) => percent(Math.abs(value) / unitsPerEm / scale);
  return {
    weights: weightRange(tables.get('fvar'), os2),
    fallback: {
      sizeAdjust: percent(scale),
      ascentOverride: metric(hhea.readInt16BE(4)),
      descentOverride: metric(hhea.readInt16BE(6)),
      lineGapOverride: metric(hhea.readInt16BE(8)),
    },
  };
}

const original = readFileSync(configPath, 'utf8');
const config = JSON.parse(original);
if (latest) {
  config.revision = JSON.parse(
    gh(`repos/${config.repository}/commits/HEAD`, 'application/json'),
  ).sha;
}
mkdirSync(target, { recursive: true });
for (const [role, face] of Object.entries(config.faces)) {
  const bytes = gh(
    `repos/${config.repository}/contents/${face.file}?ref=${config.revision}`,
    'application/vnd.github.raw',
  );
  Object.assign(face, derivedFields(role, bytes));
  writeFileSync(join(target, face.file), bytes);
  console.log(`Pulled ${face.file} for ${role} (${bytes.length} bytes).`);
}

if (JSON.stringify(config) !== JSON.stringify(JSON.parse(original))) {
  if (process.env.CI) {
    console.warn(
      `::warning::${relative(frontendRoot, configPath)} is out of step with the pulled faces; run pnpm fonts:pull locally and commit it.`,
    );
  } else {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`Updated ${relative(frontendRoot, configPath)}; commit it.`);
  }
}
const record = `Fonts: ${config.repository}@${config.revision} (${Object.values(config.faces)
  .map((face) => face.file)
  .join(', ')})`;
console.log(record);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${record}\n`);
