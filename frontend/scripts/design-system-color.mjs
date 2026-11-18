/**
 * Colour arithmetic for the design-system checks: WCAG contrast, CIELAB
 * lightness, CIEDE2000 distance and colour-vision-deficiency simulation.
 * Pure functions over six-digit hex strings, which `parseColour` reads from
 * the stylesheet's literals; no token knowledge lives here.
 */

const channels = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255);

const toLinear = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

export const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');

const toHex = (rgb) =>
  '#' + rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');

const multiply = (matrix, vector) =>
  matrix.map((row) => row.reduce((sum, weight, index) => sum + weight * vector[index], 0));

// CSS Color 4's OKLab, inverse direction: OKLab to LMS, then LMS to linear sRGB.
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

/** `oklch(L% C H)` as 8-bit sRGB channels, clipped to the gamut. */
function oklchChannels(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  const lab = [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)];
  const lms = multiply(OKLAB_TO_LMS, lab).map((value) => value ** 3);
  return multiply(LMS_TO_SRGB, lms).map((linear) =>
    Math.round(Math.min(1, Math.max(0, fromLinear(linear))) * 255),
  );
}

const alphaOf = (text) => {
  if (text === undefined) return 1;
  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
};

/**
 * A literal colour as `{ rgb, alpha }` with 8-bit channels: six-digit hex,
 * `rgb(r g b / a%)` or `oklch(L% C H / a%)`. Anything else is undefined.
 */
export function parseColour(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (isHex(text)) return { rgb: channels(text).map((channel) => channel * 255), alpha: 1 };
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (rgb) return { rgb: [rgb[1], rgb[2], rgb[3]].map(Number), alpha: alphaOf(rgb[4]) };
  const oklch = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    text,
  );
  if (!oklch) return undefined;
  const [lightness, chroma, hue] = [oklch[1], oklch[2], oklch[3]].map(Number);
  return { rgb: oklchChannels(lightness / 100, chroma, hue), alpha: alphaOf(oklch[4]) };
}

/** A parsed colour as `#rrggbb` when opaque, `rgb(r g b / a%)` when translucent. */
export function formatColour({ rgb, alpha }) {
  if (alpha >= 1) return toHex(rgb);
  return `rgb(${rgb.map(Math.round).join(' ')} / ${Number((alpha * 100).toFixed(4))}%)`;
}

function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex).map(toLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Source-over composite of any `parseColour` literal onto an opaque hex. */
export function composite(value, backdrop) {
  const colour = parseColour(value);
  if (colour?.alpha === 1) return toHex(colour.rgb);
  if (!colour || !isHex(backdrop)) return undefined;
  const base = channels(backdrop).map((channel) => channel * 255);
  return toHex(
    colour.rgb.map((channel, index) => channel * colour.alpha + base[index] * (1 - colour.alpha)),
  );
}

function linearToLab([red, green, blue]) {
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const lab = (hex) => linearToLab(channels(hex).map(toLinear));
const lightness = (hex) => lab(hex)[0];

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
const DEFICIENCY = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

function simulate(hex, deficiency) {
  const matrix = DEFICIENCY[deficiency];
  const linear = channels(hex).map(toLinear);
  const mixed = matrix.map((row) =>
    Math.min(
      1,
      Math.max(
        0,
        row.reduce((sum, weight, index) => sum + weight * linear[index], 0),
      ),
    ),
  );
  return (
    '#' +
    mixed
      .map((channel) =>
        Math.round(fromLinear(channel) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** CIEDE2000 colour difference between two hex colours. */
export function deltaE2000(first, second) {
  const [l1, a1, b1] = lab(first);
  const [l2, a2, b2] = lab(second);
  const rad = Math.PI / 180;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (b, a) => {
    if (b === 0 && a === 0) return 0;
    const angle = Math.atan2(b, a) / rad;
    return angle < 0 ? angle + 360 : angle;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const deltaL = l2 - l1;
  const deltaC = c2p - c1p;
  let deltaHue = 0;
  if (c1p * c2p !== 0) {
    deltaHue = h2p - h1p;
    if (deltaHue > 180) deltaHue -= 360;
    else if (deltaHue < -180) deltaHue += 360;
  }
  const deltaH = 2 * Math.sqrt(c1p * c2p) * Math.sin((deltaHue * rad) / 2);
  const meanL = (l1 + l2) / 2;
  const meanCp = (c1p + c2p) / 2;
  let meanH = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) meanH += h1p + h2p < 360 ? 360 : -360;
    meanH /= 2;
  }
  const t =
    1 -
    0.17 * Math.cos((meanH - 30) * rad) +
    0.24 * Math.cos(2 * meanH * rad) +
    0.32 * Math.cos((3 * meanH + 6) * rad) -
    0.2 * Math.cos((4 * meanH - 63) * rad);
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rt =
    -2 *
    Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((meanH - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (deltaL / sl) ** 2 +
      (deltaC / sc) ** 2 +
      (deltaH / sh) ** 2 +
      rt * (deltaC / sc) * (deltaH / sh),
  );
}

/**
 * Two marks are separable when their lightness differs by `minLightness`, or
 * when they stay `minDistance` apart under both red–green deficiencies.
 */
export function separation(first, second) {
  return {
    lightness: Math.abs(lightness(first) - lightness(second)),
    deuteranopia: deltaE2000(simulate(first, 'deuteranopia'), simulate(second, 'deuteranopia')),
    protanopia: deltaE2000(simulate(first, 'protanopia'), simulate(second, 'protanopia')),
  };
}
