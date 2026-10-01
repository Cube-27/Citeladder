/** URL evidence uses the same config-owned catalog for owned and external pages. */
import { policy } from '../config.ts';

export function routePageKind(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!policy.web_fetch.schemes.includes(url.protocol.slice(0, -1))) return null;
  const path = url.pathname.toLowerCase().replace(/\/$/u, '');
  if (policy.site_health.homepage_paths.includes(path)) return 'homepage';
  const slug = path
    .replaceAll(/[/_+.]+/gu, '-')
    .replaceAll(/-{2,}/gu, '-')
    .replace(/^-|-$/gu, '');
  for (const [kind, pattern] of policy.site_health.slug_patterns)
    if (new RegExp(pattern!).test(slug)) return kind!;
  const matched = policy.site_health.route_patterns
    .flatMap(([kind, pattern], priority) => {
      const match = new RegExp(pattern!, 'd').exec(path);
      return match ? [{ kind: kind!, position: match.indices![1]![0], priority }] : [];
    })
    .sort((a, b) => a.position - b.position || a.priority - b.priority);
  return matched[0]?.kind ?? null;
}
