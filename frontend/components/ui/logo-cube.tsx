/**
 * LogoCube — the Searchify mark: an answer bubble with a spark inside. The
 * bubble is the AI answer, the spark is the brand's mention in it.
 *
 * Tile-less by design — the mark is strokes and a fill on transparent, so it
 * sits on any surface (nav, footer, auth panel, app shell) without a container
 * of its own. Paint comes from two theme-aware classes so this file stays
 * hex-free: `logo-bubble` (stroke) and `logo-spark` (fill). Defaults live in
 * app/globals.css; the marketing `.mkt` rules in marketing.css stay more
 * specific and keep the landing's treatment.
 *
 * Geometry is tuned for small sizes: the 4.2 ring keeps the bubble's counter
 * open at 16px, and the spark's arms are drawn with a deliberately fat waist so
 * all four points survive rasterization down to favicon size instead of
 * blurring into a dot.
 */
export function LogoCube({ size = 28 }: Readonly<{ size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        className="logo-bubble"
        d="M53 31.5c0 11.3-9.4 20.5-21 20.5-2.8 0-5.5-.5-8-1.5L12.5 55l3.2-9.6C12.6 41.6 11 36.8 11 31.5 11 20.2 20.4 11 32 11s21 9.2 21 20.5Z"
        fill="none"
        strokeWidth="4.2"
        strokeLinejoin="round"
      />
      <path
        className="logo-spark"
        d="M32 18c1.65 4.95 3.05 8.7 4.65 10.35C38.3 29.95 42.05 31.35 47 33c-4.95 1.65-8.7 3.05-10.35 4.65C35.05 39.3 33.65 43.05 32 48c-1.65-4.95-3.05-8.7-4.65-10.35C25.7 36.05 21.95 34.65 17 33c4.95-1.65 8.7-3.05 10.35-4.65C28.95 26.7 30.35 22.95 32 18Z"
      />
    </svg>
  );
}
