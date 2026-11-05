import { ChevronDown } from 'lucide-react';

import type { FaqItem } from '@/lib/marketing-content/faq';

/*
 * What the pricing page still uses from the retired platform page; the
 * product pages themselves are `platform-page.tsx`. This goes when pricing
 * moves onto the system's sections (PR 7b).
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
