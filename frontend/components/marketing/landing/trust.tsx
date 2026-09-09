import { FileSearch, Headphones, KeyRound, ShieldCheck } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section } from '../primitives/section';

const GUARANTEE_ICONS = {
  'Security & compliance ready': ShieldCheck,
  'Advanced permissions and SSO': KeyRound,
  'Audit trail and exportable reports': FileSearch,
  'Dedicated support and success': Headphones,
} as const;

export function Trust() {
  const { trust } = LANDING_CONTENT;
  return (
    <Section id="trust" tone="sunken" rhythm="base" aria-labelledby="trust-title">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <Reveal>
          <h2 id="trust-title" className="website-section-heading">
            {trust.title}
          </h2>
        </Reveal>
        <Reveal className="lg:self-center">
          <p className="website-body max-w-[52ch]">{trust.who}</p>
        </Reveal>
      </div>
      <StaggerGroup className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {trust.guarantees.map((guarantee) => {
          const Icon = GUARANTEE_ICONS[guarantee.title];
          return (
            <StaggerItem
              key={guarantee.title}
              className="border-border-subtle grid gap-3 border-t pt-4"
            >
              <Icon className="text-accent size-5" aria-hidden />
              <h3 className="website-small-heading">{guarantee.title}</h3>
              <p className="website-body">{guarantee.description}</p>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
