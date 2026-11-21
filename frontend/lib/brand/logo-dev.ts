import { getLogoDevPublishable } from '@/lib/config/env';

function stripTrailingDots(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 46) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function logoDomain(websiteUrl: string | null | undefined): string | null {
  const raw = String(websiteUrl ?? '').trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = stripTrailingDots(parsed.hostname.toLowerCase());
  if (!host.includes('.') || parsed.username || parsed.password) return null;
  return host;
}

export function logoDevUrl(websiteUrl: string | null | undefined, size: number): string | null {
  const publishable = getLogoDevPublishable();
  if (!publishable) return null;
  const domain = logoDomain(websiteUrl);
  if (!domain) return null;
  const params = new URLSearchParams({
    token: publishable,
    size: String(Math.min(size * 2, 800)),
    format: 'png',
    theme: 'auto',
    // 404 instead of a grey monogram — see the module note.
    fallback: '404',
  });
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`;
}
