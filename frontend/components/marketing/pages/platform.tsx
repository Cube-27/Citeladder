import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';

import type { FaqItem } from '@/lib/marketing-content/faq';
import { platformLabel } from '@/lib/marketing-content/nav';
import type { PlatformScreen } from '@/lib/marketing-content/platform-pages';

import { Section } from '../primitives/section';
import { CatalogFrame } from '../screens/screen-catalog';

/*
 * What the commercial guides and the tools hub still use from the retired
 * platform page; the product pages themselves are `platform-page.tsx`. These
 * go when those pages move onto the system's sections (PR 8).
 */

export function FaqList({ faqs }: Readonly<{ faqs: readonly FaqItem[] }>) {
  return (
    <div className="mk-faq-list">
      {faqs.map((faq) => (
        <details key={faq.q}>
          <summary>
            {faq.q}
            <ChevronDown aria-hidden className="size-4" />
          </summary>
          <p className="website-body">{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

const MODULE_SCREENS: Readonly<Record<string, PlatformScreen>> = {
  '/platform/ai-visibility': 'visibility',
  '/platform/cited-sources': 'sources',
};

/** A compact product callout for research guides: copy beside one product view. */
export function ProductModule({
  path,
  heading,
  children,
}: Readonly<{ path: string; heading: string; children: ReactNode }>) {
  return (
    <Section tone="soft">
      <div className="mk-dive">
        <div className="mk-dive-copy">
          <h2 className="website-section-heading">{heading}</h2>
          <p className="website-body">{children}</p>
          <a className="mk-text-link" href={path}>
            Explore {platformLabel(path)}
            <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
        <CatalogFrame screen={MODULE_SCREENS[path] ?? 'visibility'} />
      </div>
    </Section>
  );
}
