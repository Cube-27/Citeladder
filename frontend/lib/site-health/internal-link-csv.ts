import type { InternalLink } from '@citeladder/contracts/site-health';

import { downloadCsv } from '@/lib/csv/download';

export function downloadInternalLinksCsv(links: InternalLink[]) {
  downloadCsv(
    'internal-links',
    ['Source page', 'Destination', 'Anchor text', 'Source passage'],
    links.map((link) => [
      link.source.url,
      link.target.url,
      link.anchor,
      link.placement?.text ?? '',
    ]),
  );
}
