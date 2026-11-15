/**
 * The last screen a reader used under each sidebar destination, per project,
 * for this browser session (owner, 2026-11-15): a destination's row returns
 * there (Agent reopens the last chat, Website its last tab) instead of to the
 * destination's front door. Storage can be unavailable (private windows,
 * blocked site data), so every access is guarded and absence simply means the
 * destination itself.
 */
const STORAGE_KEY = 'citeladder:destination-routes';

type Memory = Partial<Record<string, string>>;

function read(): Memory {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? (parsed as Memory) : {};
  } catch {
    return {};
  }
}

const slot = (destination: string, projectId: string) => `${projectId}:${destination}`;

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
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') ? href : null;
}
