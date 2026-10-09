import type { ReactNode } from 'react';
import { ArrowRight, KeyRound, Layers, ShieldCheck, UserCheck } from 'lucide-react';

import { NAV_DROPS } from '@/lib/marketing-content/nav';

import { NavIcon } from '../chrome/nav-icons';

import { INTEGRATIONS } from './landing-data';

/** Homepage bands below the product story: integrations, teams and trust. */

export function TextLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a className="mk-text-link" href={href}>
      {children}
      <ArrowRight aria-hidden className="size-4" />
    </a>
  );
}

export function Integrations() {
  return (
    <section className="lp-section lp-soft" id="integrations">
      <div className="lp-wrap lp-integrations">
        <div className="lp-head">
          <h2 className="website-section-heading">Works with the data you already have.</h2>
          <p className="website-lead text-muted">
            Start with AI answers alone. Connect search, analytics and research sources when the
            question needs them.
          </p>
          <TextLink href="/platform/integrations">Explore integrations</TextLink>
        </div>
        <ul className="lp-integration-list">
          {INTEGRATIONS.map(([mark, title, body]) => (
            <li key={title}>
              <span className="lp-integration-mark" aria-hidden>
                {mark}
              </span>
              <span>
                <span className="mk-capability-title">{title}</span>
                <span className="mk-capability-desc">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Teams() {
  const solutions = NAV_DROPS.find((drop) => drop.key === 'solutions')?.groups[0]?.items ?? [];
  return (
    <section className="lp-section" id="teams">
      <div className="lp-wrap lp-stack">
        <div className="lp-head lp-head-split">
          <h2 className="website-section-heading">Built for the teams responsible for search.</h2>
          <TextLink href="/solutions">Explore solutions</TextLink>
        </div>
        <ul className="lp-teams">
          {solutions.map((item) => {
            return (
              <li key={item.href}>
                <a href={item.href} className="lp-team">
                  <NavIcon href={item.href} className="text-muted size-5" />
                  <span className="mk-capability-title">{item.title}</span>
                  <span className="mk-capability-desc">{item.desc}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const TRUST = [
  [
    ShieldCheck,
    'Workspace isolation',
    'Every read and write is authorized to its workspace and project.',
  ],
  [KeyRound, 'Encrypted credentials', 'Provider keys and connections are stored encrypted.'],
  [
    Layers,
    'Evidence you can audit',
    'Raw answers and crawls are append-only; results keep their sources.',
  ],
  [
    UserCheck,
    'You stay in control',
    'Nothing publishes, contacts third parties or changes your site on its own.',
  ],
] as const;

export function Trust() {
  return (
    <section className="lp-section lp-soft" id="trust">
      <div className="lp-wrap lp-stack">
        <div className="lp-head lp-head-split">
          <h2 className="website-section-heading">How CiteLadder handles your data.</h2>
          <TextLink href="/enterprise">Enterprise</TextLink>
        </div>
        <ul className="lp-trust">
          {TRUST.map(([Icon, title, body]) => (
            <li key={title}>
              <Icon aria-hidden className="text-accent-text size-5" />
              <h3 className="website-feature-heading">{title}</h3>
              <p className="website-body text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
