import { boundedText, webUrl } from './input';
import { FREE_TOOL_LIMITS } from '@/lib/config/free-tools';

export type SchemaKind = 'Article' | 'Organization' | 'BreadcrumbList';
export function buildSchema(
  kind: SchemaKind,
  name: string,
  url: string,
  detail: string,
  date: string,
) {
  const title = boundedText(name, FREE_TOOL_LIMITS.field);
  if (!title && kind !== 'BreadcrumbList') throw new Error('Enter a name or headline.');
  const base = { '@context': 'https://schema.org', '@type': kind };
  let result: Record<string, unknown>;
  if (kind === 'BreadcrumbList') {
    const rows = boundedText(detail)
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (rows.length < 2)
      throw new Error('Enter at least two breadcrumbs, one Name | URL per line.');
    result = {
      ...base,
      itemListElement: rows.map((line, index) => {
        const separator = line.indexOf('|');
        if (separator < 1 || !line.slice(0, separator).trim())
          throw new Error('Use Name | URL for each breadcrumb.');
        return {
          '@type': 'ListItem',
          position: index + 1,
          name: line.slice(0, separator).trim(),
          item: webUrl(line.slice(separator + 1)),
        };
      }),
    };
  } else if (kind === 'Article') {
    if (!detail.trim()) throw new Error('Enter the actual author name.');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error('Enter a valid publication date.');
    result = {
      ...base,
      headline: title,
      url: webUrl(url),
      author: { '@type': 'Person', name: boundedText(detail, FREE_TOOL_LIMITS.field) },
      datePublished: date,
    };
  } else
    result = {
      ...base,
      name: title,
      url: webUrl(url),
      ...(detail.trim() ? { logo: webUrl(detail) } : {}),
    };
  const json = JSON.stringify(result, null, 2).replaceAll('<', String.raw`\u003c`);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export function socialTags(
  title: string,
  description: string,
  url: string,
  image: string,
  alt: string,
) {
  if (!title.trim() || !description.trim()) throw new Error('Enter a title and description.');
  const entries = {
    'og:type': 'website',
    'og:title': boundedText(title, FREE_TOOL_LIMITS.field),
    'og:description': boundedText(description, FREE_TOOL_LIMITS.field),
    'og:url': webUrl(url),
    ...(image.trim()
      ? { 'og:image': webUrl(image), 'og:image:alt': boundedText(alt, FREE_TOOL_LIMITS.field) }
      : {}),
  };
  return [
    ...Object.entries(entries).map(
      ([key, value]) => `<meta property="${key}" content="${escapeAttribute(value)}">`,
    ),
    `<meta name="twitter:card" content="${image.trim() ? 'summary_large_image' : 'summary'}">`,
  ].join('\n');
}
