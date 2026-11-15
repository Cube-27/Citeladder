import {
  TOKEN_CSS,
  withoutComments,
  withoutWebsiteVariants,
} from './design-system-source-checks.mjs';
import { WEBSITE_ONLY_UI } from './design-system-website-only.mjs';

/**
 * The app's colour, radius and type names: the website's
 * names alias them on its own surfaces only. Shared rules in globals.css that
 * the website also renders are exempt; app code uses the app's names.
 */
const RETIRED_COLOURS = [
  'paper',
  'surface-sunken',
  'line',
  'line-strong',
  'line-control',
  'ink-secondary',
  'ink-muted',
  'accent-ink',
  'accent-soft',
  'positive-soft',
  'negative-soft',
  'warning-soft',
  'info-soft',
  'on-accent',
  'data-1',
  'data-2',
  'data-3',
  'chart-grid',
  'stage-sky',
  'stage-mint',
  'stage-lilac',
  'stage-peach',
  'rule-ink',
];
const COLOUR_PREFIX = `(?:bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|divide|decoration|from|to|via|caret|accent|placeholder)`;
const RETIRED_COLOUR = new RegExp(
  String.raw`(?<![\w-])(?:[\w-]+:)*${COLOUR_PREFIX}-(?:${RETIRED_COLOURS.join('|')})(?:\/[\w.]+)?(?![\w-])|var\(--color-(?:${RETIRED_COLOURS.join('|')})\)`,
);
// `sm` (4) stays the app's: tags and checkboxes (brand direction 2.4).
const RETIRED_RADII = '(?:2xs|xs|md|lg|xl|sheet)';
const RETIRED_RADIUS_CLASS = new RegExp(
  String.raw`(?<![\w-])(?:[\w-]+:)*rounded(?:-[a-z]{1,2})?-${RETIRED_RADII}(?![\w-])`,
);
const RETIRED_RADIUS_VAR = new RegExp(String.raw`var\(--radius-${RETIRED_RADII}\)`);
const usesRetiredRadius = (text) =>
  RETIRED_RADIUS_CLASS.test(text) || RETIRED_RADIUS_VAR.test(text);
// `type-code` is the app's mono role for literal machine text (2.1); `type-data-sm`
// stays only in Kbd, where the app's `type-code` overrides it.
const RETIRED_TYPE =
  /(?<![\w-])type-(?:page-title|section-title|item-title|control|eyebrow|delta|figure-sm|badge|screen-label|overline|data)(?![\w-])/;

export function appVocabularyViolations(source, label, ownsProductUi) {
  if (!ownsProductUi || WEBSITE_ONLY_UI.has(label) || label === TOKEN_CSS) return [];
  if (label.startsWith('components/content/')) return [];
  if (label.includes('.test.') || !/\.(?:tsx?|css)$/.test(label)) return [];
  const text = withoutWebsiteVariants(withoutComments(source));
  const violations = [];
  if (RETIRED_COLOUR.test(text))
    violations.push(
      `${label}: the app's colours are ground, surface, well, raised, rule, control-line, ink, ink-2 and their roles`,
    );
  // The website's segmented track and its link and mark sizes are kept, by name, in two shared atoms.
  if (
    usesRetiredRadius(text) &&
    !['components/ui/tabs.tsx', 'components/ui/text-link.tsx'].includes(label)
  )
    violations.push(
      `${label}: the app's radii are rounded-mark, -sm, -control, -card, -overlay and -full`,
    );
  if (RETIRED_TYPE.test(text) && label !== 'components/ui/typography.tsx')
    violations.push(
      `${label}: the website's type role; the app uses its own (components/ui/typography.tsx)`,
    );
  return violations;
}
