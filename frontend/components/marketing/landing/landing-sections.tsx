import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { NAV_DROPS } from '@/lib/marketing-content/nav';

import { EngineLogo } from '../primitives/engine-logo';
import { INTEGRATIONS, type IntegrationMark } from './landing-data';

/** Homepage bands below the product story: integrations, teams and trust. */

export function TextLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a className="mk-text-link" href={href}>
      {children}
      <ArrowRight aria-hidden className="size-4" />
    </a>
  );
}

/** The source's own logo on a white tile; decorative beside its name. */
function IntegrationLogo({ mark }: Readonly<{ mark: IntegrationMark }>) {
  switch (mark.kind) {
    case 'engines':
      return (
        <span className="lp-integration-mark" data-count={mark.engines.length} aria-hidden>
          {mark.engines.map((engine) => (
            <EngineLogo key={engine} engine={engine} className="lp-integration-glyph" />
          ))}
        </span>
      );
    case 'image':
      return (
        <span className="lp-integration-mark" aria-hidden>
          <img
            src={mark.src}
            alt=""
            width={128}
            height={128}
            loading="lazy"
            decoding="async"
            className="lp-integration-glyph"
          />
        </span>
      );
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

export function Integrations() {
  return (
    <section className="lp-section site-band" id="integrations">
      <div className="lp-wrap site-wrap site-split">
        <div className="lp-head">
          <h2 className="website-section-heading">Works with the data you already have</h2>
          <p className="website-lead">
            Start with AI answers alone. Connect search, analytics and research sources when the
            question needs them.
          </p>
          <TextLink href="/platform/integrations">Explore integrations</TextLink>
        </div>
        <ul className="lp-integration-list">
          {INTEGRATIONS.map(({ mark, title, body }) => (
            <li key={title}>
              <IntegrationLogo mark={mark} />
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
    <section className="lp-section site-band" id="teams">
      <div className="lp-wrap site-wrap lp-stack">
        <div className="lp-head lp-head-split">
          <h2 className="website-section-heading">Built for the teams responsible for search</h2>
          <TextLink href="/solutions">Explore solutions</TextLink>
        </div>
        <ul className="lp-teams site-cards">
          {solutions.map((item) => {
            return (
              <li key={item.href}>
                <a href={item.href} className="lp-team site-card">
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
  ['Workspace isolation', 'Every read and write is authorized to its workspace and project.'],
  ['Encrypted credentials', 'Provider keys and connections are stored encrypted.'],
  ['Evidence you can audit', 'Raw answers and crawls are append-only; results keep their sources.'],
  [
    'You stay in control',
    'Nothing publishes, contacts third parties or changes your site on its own.',
  ],
] as const;

/* A split, not another card row: the heading beside a two-by-two list. */
export function Trust() {
  return (
    <section className="lp-section site-band" id="trust">
      <div className="lp-wrap site-wrap site-split">
        <div className="lp-head">
          <h2 className="website-section-heading">How CiteLadder handles your data</h2>
          <TextLink href="/enterprise">Enterprise</TextLink>
        </div>
        <ul className="lp-trust">
          {TRUST.map(([title, body]) => (
            <li key={title}>
              <h3 className="website-feature-heading">{title}</h3>
              <p className="website-body">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
