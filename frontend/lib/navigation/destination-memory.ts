import { z } from 'zod';

/**
 * The last screen a reader used under each sidebar destination, per project,
 * for this browser session (owner, 2026-11-15): a destination's row returns
 * there (Agent reopens the last chat, Website its last tab) instead of to the
 * destination's front door. Storage can be unavailable (private windows,
 * blocked site data), so every access is guarded and absence simply means the
 * destination itself.
 */
const STORAGE_KEY = 'citeladder:destination-routes';

const memorySchema = z.record(z.string(), z.string());

function read(): z.infer<typeof memorySchema> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = memorySchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

const slot = (destination: string, projectId: string) => `${projectId}:${destination}`;

/**
 * The route to return to: the screen's query without its `project` and
 * `workspace` scope (added back when the link is built). A new chat's query
 * is a one-time handoff whose context the reader may since have removed, so
 * a new chat is remembered bare.
 */
export function routeToRemember(pathname: string, search: string): string {
  if (pathname === '/agent') return pathname;
  const params = new URLSearchParams(search);
  params.delete('project');
  params.delete('workspace');
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function rememberDestinationRoute(
  destination: string,
  projectId: string,
  href: string,
): void {
  try {
    const memory = read();
    if (memory[slot(destination, projectId)] === href) return;
    memory[slot(destination, projectId)] = href;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Unavailable storage only loses the convenience, never the navigation.
  }
}

export function rememberedDestinationRoute(
  destination: string,
  projectId: string | null,
): string | null {
  if (!projectId) return null;
  const href = read()[slot(destination, projectId)];
  // Only in-app paths; anything else in storage is ignored.
  return href?.startsWith('/') && !href.startsWith('//') ? href : null;
}
