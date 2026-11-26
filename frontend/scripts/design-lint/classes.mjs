const LAYOUT = [
  /^(?:flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents|table|table-[\w-]+|flow-root|list-item)$/,
  /^flex-(?:row|col|row-reverse|col-reverse|wrap|wrap-reverse|nowrap|1|auto|initial|none)$/,
  /^(?:grow|grow-0|shrink|shrink-0|basis-full|basis-auto|basis-0)$/,
  /^(?:items|justify|content|self|place-items|place-content|place-self|justify-items|justify-self)-[a-z-]+$/,
  /^(?:min-w-0|min-h-0|w-full|h-full|size-full|w-auto|h-auto|w-fit|h-fit|w-max|w-min|max-w-full|max-w-none|min-w-full|min-h-full|w-screen|h-screen|h-dvh|min-h-dvh|min-h-screen|max-h-full|min-w-max|min-w-fit|max-w-max|max-w-fit)$/,
  /^overflow(?:-[xy])?-(?:auto|hidden|visible|scroll|clip)$/,
  /^(?:truncate|text-ellipsis|text-clip|whitespace-[\w-]+|break-[\w-]+|text-wrap|text-nowrap|text-balance|text-pretty|hyphens-\w+|wrap-[\w-]+)$/,
  /^(?:sr-only|not-sr-only|static|relative|absolute|fixed|sticky|isolate|isolation-auto)$/,
  /^(?:inset|inset-x|inset-y|top|right|bottom|left|start|end)-(?:0|auto|full|1\/2)$/,
  /^text-(?:left|center|right|start|end|justify)$/,
  /^(?:col|row)-(?:span|start|end)-(?:\d+|full|auto)$/,
  /^(?:col|row)-auto$/,
  /^grid-(?:cols|rows)-(?:\d+|none|subgrid)$/,
  /^grid-flow-[\w-]+$/,
  /^auto-(?:cols|rows)-\w+$/,
  /^order-[\w-]+$/,
  /^(?:pointer-events-\w+|select-\w+|cursor-[\w-]+|touch-[\w-]+|resize[\w-]*|appearance-none|outline-none|list-none|list-inside|list-outside|list-disc|list-decimal)$/,
  /^(?:visible|invisible|collapse|backface-hidden)$/,
  /^aspect-(?:square|video|auto)$/,
  /^(?:group|peer)(?:\/[\w-]+)?$/,
  /^object-(?:cover|contain|fill|none|center|top|bottom|left|right|scale-down)$/,
  /^align-[\w-]+$/,
  /^(?:float|clear)-\w+$/,
  /^box-(?:border|content)$/,
  /^@container(?:\/[\w-]+)?$/,
  /^container$/,
  /^snap-[\w-]+$/,
  /^scroll-(?:smooth|auto)$/,
  /^overscroll-[\w-]+$/,
  /^will-change-\w+$/,
  /^contain-\w+$/,
  /^-?translate-[xy]-(?:0|1\/2|full)$/,
  /^transform(?:-gpu|-none)?$/,
  /^m[xytblrse]?-auto$/,
  /^forced-color-adjust-\w+$/,
];

const VALUE = [
  /^(?:text|bg|border|ring|ring-offset|outline|fill|stroke|decoration|divide|placeholder|caret|accent|from|via|to|shadow|inset-ring|inset-shadow|rounded)(?:-|$)/,
  /^(?:type|font|leading|tracking|indent|line-clamp|underline-offset)-/,
  /^(?:tabular-nums|lining-nums|oldstyle-nums|proportional-nums|ordinal|slashed-zero|uppercase|lowercase|capitalize|normal-case|italic|not-italic|underline|overline|no-underline|line-through|antialiased|subpixel-antialiased)$/,
  /^(?:gap|gap-x|gap-y|space-[xy]|p[xytblrse]?|m[xytblrse]?|scroll-m[xytblrse]?|scroll-p[xytblrse]?)-/,
  /^(?:inset|inset-x|inset-y|top|right|bottom|left|start|end|translate-[xy])-/,
  /^(?:w|h|size|min-w|min-h|max-w|max-h|basis|columns|grid-cols|grid-rows)-/,
  /^(?:opacity|blur|backdrop|drop-shadow|mix-blend|brightness|contrast|grayscale|saturate|sepia|invert|hue-rotate|filter|bg-blend|scale|rotate|skew|origin)(?:-|$)/,
  /^(?:transition|duration|ease|delay|animate)(?:-|$)/,
  /^z-/,
];

export function splitTokens(text) {
  return text.split(/\s+/).filter(Boolean);
}

function utilityOf(token) {
  let depth = 0;
  let last = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0) last = index + 1;
  }
  return token
    .slice(last)
    .replace(/^!|!$/g, '')
    .replace(/^-(?=[a-z])/, '');
}

export function isValueClass(token) {
  const utility = utilityOf(token);
  if (!utility || LAYOUT.some((pattern) => pattern.test(utility))) return false;
  if (/[[(]/.test(utility)) return true;
  return VALUE.some((pattern) => pattern.test(utility));
}

const SURVIVOR =
  /^(?:leading-(?:\d+(?:\.\d+)?|none|px)|text-[a-z][\w-]*\/(?:\d+(?:\.\d+)?|px)|z-[1-9]\d*|opacity-(?:[1-9]|[1-9]\d)|duration-[1-9]\d*|delay-[1-9]\d*)$/;

export function isSurvivor(token) {
  return SURVIVOR.test(utilityOf(token));
}

const MONOCHROME =
  /^(?:bg|text|border(?:-[xytrblse])?|ring|ring-offset|outline|fill|stroke|decoration|divide|placeholder|caret|accent|from|via|to|shadow|inset-ring|inset-shadow)-(?:white|black)(?:\/\S+)?$/;

export function isMonochrome(token) {
  return MONOCHROME.test(utilityOf(token));
}

export function isSurfaceVariant(token) {
  return /\[\[data-public-surface\b[^\]]*\]/.test(token) && token.includes(']:');
}

const HEX = /(?:^|[^\w&#]|_)#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])/i;
const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\(/i;

export function colourLiteralIn(text) {
  return HEX.exec(text)?.[0].replace(/^[^#]+/, '') ?? COLOUR_FUNCTION.exec(text)?.[0] ?? null;
}
