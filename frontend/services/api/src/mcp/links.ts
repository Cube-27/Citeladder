/**
 * Links into the app for MCP results. Paths are the router's real screens
 * (`apps/app/src/router.tsx`); `?project=` is the shell's project hand-off.
 * In-app Agent reads have no origin and keep relative links.
 */
import { recordScreen, type RecordKindName } from '@citeladder/contracts/record-kinds';

export function appLink(
  origin: string,
  path: string,
  projectId: string,
  params: Record<string, string> = {},
): string {
  // A screen may carry its own query (`?tab=`); the hand-off joins it.
  const url = new URL(path, 'https://app.invalid');
  for (const [key, value] of Object.entries({ ...params, project: projectId }))
    url.searchParams.set(key, value);
  const relative = `${url.pathname}${url.search}`;
  return origin ? new URL(relative, origin).href : relative;
}

/** The screen that shows a record (the contracts' record-kind table): its own page when it has one. */
export function recordPath(kind: RecordKindName, record: Record<string, unknown>): string {
  return recordScreen(kind, (key) => (typeof record[key] === 'string' ? record[key] : ''));
}
