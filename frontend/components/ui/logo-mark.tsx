/**
 * LogoMark — the Searchify mark: a magnifier whose lens carries a filled dot.
 * The magnifier is the query, the dot is the brand found inside the answer.
 *
 * One mark for the whole product. It replaces `LogoCube` (the answer-bubble +
 * spark drawing), which the marketing rebuild superseded — the app had kept
 * showing the old mark on login, the shell and onboarding while marketing
 * showed the new one, which is exactly the kind of split a brand cannot afford
 * on its sign-in screen.
 *
 * Tiled, not tile-less: the glyph sits on a gradient chip, because the mark
 * reads as a product logo at 26px only with the chip behind it. Paint lives in
 * `.logo-mark` in globals.css so this file stays hex-free (no-raw-hex guard),
 * and the marketing `.mkt .marketing-logo` rules stay more specific so the
 * landing keeps its own glow treatment.
 */
export function LogoMark({ size = 28 }: Readonly<{ size?: number }>) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="6.25" cy="6.25" r="3.75" />
        <path d="m9.2 9.2 4.3 4.3" />
        <circle className="logo-mark-dot" cx="6.25" cy="6.25" r="1.25" />
      </svg>
    </span>
  );
}
