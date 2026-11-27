import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_CSS = 'apps/app/src/globals.css';
const APP_SHEETS = [
  ...readFileSync(new URL(`../${TOKEN_CSS}`, import.meta.url), 'utf8').matchAll(
    /^@import '\.\/([\w-]+\.css)';$/gmu,
  ),
].map((match) => `apps/app/src/${match[1]}`);
export const TOKEN_FILES = [...APP_SHEETS, 'apps/app/src/public-surface.css'];
const LIGHT = ':root';
const DARK = ":root[data-theme='dark']";
const APP_LIGHT = ':root:not([data-public-surface])';
const APP_DARK = ":root[data-theme='dark']:not([data-public-surface])";
const PUBLIC = ':root[data-public-surface]';
const PUBLIC_LIGHT = ":root[data-public-surface]:not([data-theme='dark'])";
const PUBLIC_DARK = ":root[data-public-surface][data-theme='dark']";
const MARKETING_LIGHT = ':root[data-marketing-surface]';
const MARKETING_DARK = ":root[data-marketing-surface][data-theme='dark']";
const SCOPES = [
  { name: PUBLIC_LIGHT, layers: [PUBLIC_LIGHT, PUBLIC], kind: 'website' },
  { name: PUBLIC_DARK, layers: [DARK, PUBLIC, PUBLIC_DARK], kind: 'website' },
  { name: MARKETING_LIGHT, layers: [PUBLIC_LIGHT, PUBLIC, MARKETING_LIGHT], kind: 'marketing' },
  {
    name: MARKETING_DARK,
    layers: [DARK, PUBLIC_DARK, PUBLIC, MARKETING_LIGHT, MARKETING_DARK],
    kind: 'marketing',
  },
  { name: APP_LIGHT, layers: [APP_LIGHT], kind: 'app' },
  { name: APP_DARK, layers: [DARK, APP_LIGHT, APP_DARK], kind: 'app' },
];

const color = (role) => `--color-${role}`;
const TEXT = '--text-color-';
const text = (role) => `${TEXT}${role}`;
const STATUSES = ['positive', 'negative', 'warning', 'info'];
const SHARED_GROUNDS = ['ground', 'panel', 'well'].map(color);
const WEBSITE_GROUNDS = [...SHARED_GROUNDS, color('site-page')];
const MARKETING_GROUNDS = [...WEBSITE_GROUNDS, color('site-well')];
const APP_FILLS = ['ground', 'panel', 'raised', 'raised-2'].map(color);
const APP_GROUNDS = [...APP_FILLS, color('well')];
const APP_SERIES = ['data-you', 'data-rival-1', 'data-rival-2', 'data-rival-3', 'data-rival-4'];
const GROUNDS = { website: WEBSITE_GROUNDS, marketing: MARKETING_GROUNDS, app: APP_GROUNDS };

const TEXT_ON = {
  'on-ink': { surfaces: [color('mark-ink')] },
  'on-primary': { surfaces: [color('primary-from'), color('primary-to')] },
  'accent-text': { surfaces: [color('ground'), color('panel'), color('accent-wash')] },
  'site-chip-ink': { surfaces: [color('site-chip')], only: 'marketing' },
  'site-band-ink-2': {
    surfaces: ['site-band-from', 'site-band-mid', 'site-band-to'].map(color),
    only: 'marketing',
  },
  'metric-ink': {
    surfaces: [color('metric-impressions')],
    only: 'app',
  },
  'metric-ink-dark': { surfaces: [color('metric-position')], only: 'app' },
};

const CONTRAST_PAIRS = [
  {
    inks: ['ink', 'ink-2'].map(text),
    surfaces: ['state-hover', 'state-pressed', 'state-selected'].map(color),
    over: SHARED_GROUNDS,
    minimum: 4.5,
  },
  {
    inks: [text('ink')],
    surfaces: ['accent', ...STATUSES].map((role) => color(`${role}-wash`)),
    minimum: 4.5,
  },
  ...STATUSES.map((status) => ({
    inks: [color(status)],
    surfaces: [color('ground'), color('panel'), color(`${status}-wash`)],
    minimum: 4.5,
  })),
  { inks: [color('accent'), color('focus')], surfaces: SHARED_GROUNDS, minimum: 3 },
  { inks: [color('control-line')], surfaces: SHARED_GROUNDS, minimum: 3, only: 'website' },
  {
    inks: [text('ink')],
    surfaces: ['site-band-from', 'site-band-mid', 'site-band-to'].map(color),
    minimum: 4.5,
    only: 'marketing',
  },
  { inks: [color('site-mark')], surfaces: [color('site-page')], minimum: 3, only: 'marketing' },
  { inks: [color('focus')], surfaces: APP_FILLS, minimum: 3, only: 'app' },
  {
    inks: [text('ink-placeholder')],
    surfaces: [color('well-hover')],
    minimum: 4.5,
    only: 'app',
  },
  {
    inks: ['ink', 'ink-2'].map(text),
    surfaces: [
      'state-hover',
      'state-pressed',
      'state-selected',
      'state-fill',
      'state-fill-hover',
    ].map(color),
    over: ['ground', 'panel', 'raised'].map(color),
    minimum: 4.5,
    only: 'app',
  },
  {
    inks: [text('ink-2')],
    surfaces: ['accent', ...STATUSES].map((role) => color(`${role}-wash`)),
    minimum: 4.5,
    only: 'app',
  },
  ...STATUSES.map((status) => ({
    inks: [color(status)],
    surfaces: [...APP_FILLS, color(`${status}-wash`)],
    minimum: 4.5,
    only: 'app',
  })),
  {
    inks: [text('accent-text')],
    surfaces: APP_FILLS,
    minimum: 4.5,
    only: 'app',
  },
  {
    inks: [color('accent'), ...APP_SERIES.map(color), color('data-other')],
    surfaces: APP_FILLS,
    minimum: 3,
    only: 'app',
  },
];

function textRows(palette) {
  return [...palette.keys()]
    .filter((token) => token.startsWith(TEXT))
    .map((token) => {
      const placed = TEXT_ON[token.slice(TEXT.length)];
      return placed
        ? { inks: [token], minimum: 4.5, ...placed }
        : { inks: [token], surfaces: undefined, minimum: 4.5 };
    });
}

/** @public */
export function contrastRoles() {
  const rows = [...CONTRAST_PAIRS, ...Object.values(TEXT_ON)];
  return {
    inks: [
      ...new Set([
        ...CONTRAST_PAIRS.flatMap(({ inks }) => inks),
        ...Object.keys(TEXT_ON).map(text),
      ]),
    ],
    surfaces: [
      ...new Set([...rows.flatMap(({ surfaces }) => surfaces), ...Object.values(GROUNDS).flat()]),
    ],
  };
}

const channels = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16));
const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');
const toHex = (rgb) =>
  '#' + rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
const toLinear = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
const multiply = (matrix, vector) =>
  matrix.map((row) => row.reduce((sum, weight, index) => sum + weight * vector[index], 0));

const OKLAB_TO_LMS = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_SRGB = [
  [4.0767416360759583, -3.3077115392580629, 0.2309699031821043],
  [-1.2684379732850315, 2.6097573492876882, -0.341319376002657],
  [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117],
];

function oklchChannels(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  const lab = [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
  const lms = multiply(OKLAB_TO_LMS, lab).map((value) => value ** 3);
  return multiply(LMS_TO_SRGB, lms).map((linear) =>
    Math.round(Math.min(1, Math.max(0, fromLinear(linear))) * 255),
  );
}

const SRGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

function channelsToOklch(rgb) {
  const lms = multiply(
    SRGB_TO_LMS,
    rgb.map((channel) => toLinear(channel / 255)),
  ).map(Math.cbrt);
  const [lightness, a, b] = multiply(LMS_TO_OKLAB, lms);
  return [lightness, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function mixInOklch(first, second, weight) {
  const [l1, c1, h1] = channelsToOklch(first);
  const [l2, c2, h2] = channelsToOklch(second);
  const from = c1 < 1e-4 ? h2 : h1;
  const to = c2 < 1e-4 ? h1 : h2;
  const turn = ((to - from + 540) % 360) - 180;
  const rest = 1 - weight;
  return oklchChannels(l1 * weight + l2 * rest, c1 * weight + c2 * rest, from + turn * rest);
}

const alphaOf = (text) => {
  if (text === undefined) return 1;
  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
};

function parseColour(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (isHex(text)) return { rgb: channels(text), alpha: 1 };
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (rgb) return { rgb: [rgb[1], rgb[2], rgb[3]].map(Number), alpha: alphaOf(rgb[4]) };
  const oklch = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    text,
  );
  if (!oklch) return undefined;
  const [lightness, chroma, hue] = [oklch[1], oklch[2], oklch[3]].map(Number);
  return { rgb: oklchChannels(lightness / 100, chroma, hue), alpha: alphaOf(oklch[4]) };
}

function formatColour({ rgb, alpha }) {
  if (alpha >= 1) return toHex(rgb);
  return `rgb(${rgb.map(Math.round).join(' ')} / ${Number((alpha * 100).toFixed(4))}%)`;
}

function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex).map((channel) => toLinear(channel / 255));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function composite(value, backdrop) {
  const colour = parseColour(value);
  if (colour?.alpha === 1) return toHex(colour.rgb);
  if (!colour || !isHex(backdrop)) return undefined;
  const base = channels(backdrop);
  return toHex(
    colour.rgb.map((channel, index) => channel * colour.alpha + base[index] * (1 - colour.alpha)),
  );
}

function topLevelRules(clean) {
  const rules = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open === -1) break;
    let depth = 1;
    let close = open + 1;
    while (close < clean.length && depth > 0) {
      if (clean[close] === '{') depth += 1;
      if (clean[close] === '}') depth -= 1;
      close += 1;
    }
    const prelude = clean.slice(cursor, open).split(';').at(-1).trim();
    rules.push({
      selectors: prelude.split(',').map((part) => part.replace(/\s+/g, ' ').trim()),
      body: clean.slice(open + 1, close - 1),
    });
    cursor = close;
  }
  return rules;
}

function customProperties(body) {
  const segments = body.replace(/\{[^{}]*\}/g, ';').split(';');
  return segments.flatMap((segment) => {
    const colon = segment.indexOf(':');
    const token = segment.slice(0, colon).trim();
    const value = segment.slice(colon + 1).trim();
    return colon > 0 && /^--[\w-]+$/.test(token) && value ? [[token, value]] : [];
  });
}

/** @public */
export function paletteDeclarations(source, selector) {
  const rules = topLevelRules(source.replace(/\/\*[\s\S]*?\*\//g, ''));
  const declarations = (scope) =>
    rules
      .filter(({ selectors }) => selectors.includes(scope))
      .flatMap(({ body }) => customProperties(body));
  const layers = (Array.isArray(selector) ? selector : [selector]).filter(
    (layer) => layer !== LIGHT,
  );
  return new Map([
    ...declarations('@theme'),
    ...declarations('@theme inline'),
    ...declarations(LIGHT),
    ...layers.flatMap((layer) => declarations(layer)),
  ]);
}

const MIX =
  /^color-mix\(\s*in oklch,\s*var\((--[\w-]+)\)\s+([\d.]+)%\s*,\s*var\((--[\w-]+)\)\s*\)$/;
const RELATIVE = /^oklch\(\s*from\s+var\((--[\w-]+)\)\s+l\s+c\s+h\s*(?:\/\s*([\d.]+)%\s*)?\)$/;

/** @public */
export function resolvePalette(source, selector) {
  const values = paletteDeclarations(source, selector);
  const resolve = (token, seen = new Set()) => {
    if (seen.has(token)) return undefined;
    seen.add(token);
    const value = values.get(token);
    const alias = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (alias) return resolve(alias, seen);
    const mix = MIX.exec(value ?? '');
    if (mix) {
      const [first, second] = [mix[1], mix[3]].map((part) =>
        parseColour(resolve(part, new Set(seen))),
      );
      if (first?.alpha !== 1 || second?.alpha !== 1) return undefined;
      return formatColour({
        rgb: mixInOklch(first.rgb, second.rgb, Number(mix[2]) / 100),
        alpha: 1,
      });
    }
    const relative = RELATIVE.exec(value ?? '');
    if (!relative) {
      const colour = parseColour(value);
      return colour ? formatColour(colour) : value;
    }
    const base = parseColour(resolve(relative[1], seen));
    if (!base) return undefined;
    const alpha = relative[2] === undefined ? base.alpha : Number(relative[2]) / 100;
    return formatColour({ rgb: base.rgb, alpha });
  };
  return new Map([...values.keys()].map((token) => [token, resolve(token)]));
}

function rowViolations(palette, scope, { inks, surfaces, over = [color('panel')], minimum }) {
  return over.flatMap((groundToken) =>
    surfaces.flatMap((surfaceToken) => {
      const surface = composite(palette.get(surfaceToken), palette.get(groundToken));
      const label = over.length > 1 ? `${surfaceToken} over ${groundToken}` : surfaceToken;
      return inks.flatMap((inkToken) => {
        const ink = composite(palette.get(inkToken), surface);
        if (!isHex(ink) || !isHex(surface))
          return [`${TOKEN_CSS}: ${scope} cannot resolve ${inkToken} on ${label}`];
        const ratio = contrastRatio(ink, surface);
        return ratio < minimum
          ? [
              `${TOKEN_CSS}: ${scope} ${inkToken} on ${label} is ${ratio.toFixed(2)}:1; needs ${minimum}:1`,
            ]
          : [];
      });
    }),
  );
}

/** @public */
export function paletteViolations(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = clean.includes(`${DARK} {`)
    ? []
    : [`${TOKEN_CSS}: dark theme token mapping is missing`];
  for (const { name, layers, kind } of SCOPES) {
    const palette = resolvePalette(source, layers);
    const holds = (row) =>
      row.only === undefined ||
      row.only === kind ||
      (row.only === 'website' && kind === 'marketing');
    const rows = [
      ...CONTRAST_PAIRS,
      ...textRows(palette).map((row) => ({ ...row, surfaces: row.surfaces ?? GROUNDS[kind] })),
    ];
    for (const row of rows.filter(holds)) {
      violations.push(...rowViolations(palette, name, row));
    }
  }
  return violations;
}

/** @public */
export function tokenSource(root) {
  return TOKEN_FILES.map((file) => readFileSync(join(root, ...file.split('/')), 'utf8')).join('\n');
}

export function textContrast(root) {
  return paletteViolations(tokenSource(root));
}
