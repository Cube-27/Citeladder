import { ACTIVE_PROJECT_STORAGE_KEY } from '@/lib/project/active-project-storage';

/**
 * Set on `<html>` before first paint when this browser carries a trace of a
 * previous session. `globals.css` hides the anonymous nav actions under it.
 */
export const RETURNING_VISITOR_ATTRIBUTE = 'data-returning-visitor';

// Plain string so it runs as parsed, before the nav that follows it paints.
const HINT_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(ACTIVE_PROJECT_STORAGE_KEY)}))` +
  `document.documentElement.setAttribute(${JSON.stringify(RETURNING_VISITOR_ATTRIBUTE)},"")}catch(e){}`;

/**
 * The marketing pages are fully static, so their HTML always carries the
 * anonymous "Log in" actions; a signed-in visitor saw them from first paint
 * until hydration swapped in the session placeholder — the refresh flicker.
 * The session cookie is HttpOnly, so this reads the same stored-project trace
 * `useMarketingSession` already keys its placeholder on, and marks the
 * document before the nav is parsed. It only ever hides; React decides what
 * to show once it has hydrated.
 */
export function ReturningVisitorHint() {
  return <script dangerouslySetInnerHTML={{ __html: HINT_SCRIPT }} />;
}
