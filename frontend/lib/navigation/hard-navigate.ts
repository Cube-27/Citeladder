/**
 * A full-page navigation that deliberately leaves the SPA.
 *
 * Two cases need this rather than the Next router: handing off to an external
 * hosted checkout, and bouncing to auth in a way that guarantees a clean
 * re-read of session state on return. Both are "leave this app", not "route
 * within it".
 *
 * It exists as a named function because `window.location.assign` cannot be
 * intercepted in jsdom, so a component calling it directly is untestable —
 * the assertion "this click navigated instead of posting" is exactly the one
 * worth making about a billing flow.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
