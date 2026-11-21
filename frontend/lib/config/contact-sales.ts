const CONTACT_PATH = '/contact';

export function contactSalesHref(href: string | null | undefined, fallback = CONTACT_PATH): string {
  if (!href) return fallback;
  try {
    const url = new URL(href);
    if (
      ['cube27.com', 'www.cube27.com'].includes(url.hostname) &&
      /^\/contact\/?$/.test(url.pathname)
    )
      return fallback;
  } catch {}
  return href;
}
