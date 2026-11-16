import { approachLabel } from '@/lib/agent/vocabulary';
import { readableUrl, shortUrlTitle } from '@/lib/format';

/** What an Action's title is built from; a chat's Action carries only its label. */
export type TitledAction = Readonly<{
  target_label: string;
  approach?: string | null;
  target_kind?: string | null;
  target_url?: string | null;
}>;

function httpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * A page of your own site by its path, so a list of one site's pages is told
 * apart by what differs: the first segment and the tail stay, the middle is
 * `…` ("/blog/…/launch-notes"), and the root reads "Home page (/)".
 */
function pagePath(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean).map(readableUrl);
  if (segments.length === 0) return 'Home page (/)';
  if (segments.length <= 2) return `/${segments.join('/')}`;
  return `/${segments[0]}/…/${segments.at(-1)}`;
}

/**
 * The target as a title names it: your own page by its path; another site's
 * page by its host and tail ("thecoffeecompass.net/…/best-subscriptions");
 * a topic, query or issue by its label. The Actions list titles a row by it alone.
 */
export function actionTarget(action: TitledAction): string {
  const url = httpUrl(action.target_label);
  if (action.target_kind === 'page') {
    const page = url ?? httpUrl(action.target_url);
    if (page) return pagePath(page);
  }
  return url ? shortUrlTitle(action.target_label) : readableUrl(action.target_label);
}

/**
 * A sentence about the Action with its whole target address named short, as
 * the title names it, so the page reads the full URL once (its Target row).
 */
export function withShortTarget(text: string, action: TitledAction): string {
  if (!httpUrl(action.target_label)) return text;
  return text.replaceAll(readableUrl(action.target_label), actionTarget(action));
}

/**
 * An Action's one title, used by the queue, the chat and the Action's page:
 * the work and its target ("Improve internal links: /pricing"), or the target
 * alone when the Action has no known type. `full` gives the whole target, for
 * the tooltip behind a cut title.
 */
export function actionTitle(action: TitledAction, { full = false } = {}): string {
  const target = full ? readableUrl(action.target_label) : actionTarget(action);
  const work = approachLabel(action.approach);
  return work ? `${work}: ${target}` : target;
}
