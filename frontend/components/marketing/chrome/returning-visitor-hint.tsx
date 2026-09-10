/**
 * Set on `<html>` before first paint when this browser holds a live session.
 * `globals.css` hides the anonymous nav actions under it.
 */
export const RETURNING_VISITOR_ATTRIBUTE = 'data-returning-visitor';

/**
 * The non-secret companion the backend sets beside the HttpOnly session cookie
 * (`app/api/browser_cookies.py`). It holds no token, and the browser expires it
 * on the session's own schedule.
 */
export const SESSION_HINT_COOKIE = 'citeladder_session_hint';

// `document.cookie` joins its pairs with "; ", so prefixing the same separator
// makes the first pair match on the identical boundary as the rest — which is
// what keeps this from matching a cookie whose name merely ends in ours.
const HINT_NEEDLE = `; ${SESSION_HINT_COOKIE}=`;

/** Does this browser still hold the session hint the backend issued? */
export function hasSessionHintCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return `; ${document.cookie}`.includes(HINT_NEEDLE);
}

/**
 * Expire the hint by hand.
 *
 * The cookie tracks the session's *expiry*, which is all a browser can enforce.
 * It cannot know about a session revoked before then — a sign-out in another
 * tab, or a `session_version` bump — so when `/me` answers 401 while the hint
 * is still present, the hint is stale and the next page load would flash
 * "Dashboard" again. Dropping it here makes that wrong guess happen at most
 * once per revocation.
 */
export function clearSessionHintCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

// Plain string so it runs as parsed, before the nav that follows it paints.
const HINT_SCRIPT =
  `try{if(("; "+document.cookie).indexOf(${JSON.stringify(HINT_NEEDLE)})>=0)` +
  `document.documentElement.setAttribute(${JSON.stringify(RETURNING_VISITOR_ATTRIBUTE)},"")}catch(e){}`;

/**
 * The marketing pages are fully static, so their HTML always carries the
 * anonymous "Log in" actions; a signed-in visitor saw them from first paint
 * until hydration swapped in the session placeholder — the refresh flicker.
 *
 * This previously keyed on a stored active-project id in `localStorage`, and
 * that is the bug being fixed here: `localStorage` has no expiry, so a browser
 * whose session had simply timed out still claimed to be returning, painted
 * "Dashboard", and then swapped it for "Log in" the moment `/me` answered 401 —
 * the same flicker, pointing the other way, and on the more confusing side
 * (a call to action that evaporates). The hint cookie shares the session
 * cookie's `max-age`, so the guess and the session end together.
 *
 * It only ever hides; React decides what to show once it has hydrated.
 */
export function ReturningVisitorHint() {
  return <script dangerouslySetInnerHTML={{ __html: HINT_SCRIPT }} />;
}
