/**
 * Chart series palette — the fixed categorical slot order.
 *
 * Slot 1 is the brand's own accent; slots 2–5 are validated for CVD separation
 * (protan/deutan/tritan ΔE ≥ 8) and ≥ 3:1 contrast against both the light and
 * dark chart surfaces. The values live as `--series-*` in globals.css; these
 * are the bridged Tailwind class forms.
 *
 * Rules (see the dataviz method):
 *   - assign in fixed order, never cycled — a 6th series folds into "Other";
 *   - colour follows the ENTITY, not its rank, so a filter that changes the
 *     series count must not repaint the survivors;
 *   - identity is never colour-alone — always pair a swatch with its name.
 *
 * Class strings are written out in full (never interpolated) so Tailwind's
 * scanner can see them.
 */
/** `bg-*` form, for legend/tooltip swatches that are HTML rather than SVG. */
const SERIES_BG = [
  'bg-series-1',
  'bg-series-2',
  'bg-series-3',
  'bg-series-4',
  'bg-series-5',
] as const;

/** Number of distinct series slots before everything folds into "Other". */
const SERIES_SLOT_COUNT = SERIES_BG.length;

export const seriesBg = (i: number) => SERIES_BG[Math.min(i, SERIES_SLOT_COUNT - 1)];
