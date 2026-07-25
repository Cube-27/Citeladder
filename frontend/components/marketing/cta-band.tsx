import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { ByokTrust } from './byok-trust';
import { Reveal, StaggerGroup, StaggerItem } from './motion-primitives';

export function EvidenceBand() {
  return (
    <section className="proof-band" id="evidence" aria-labelledby="proof-title">
      <div className="container">
        <Reveal className="proof-heading">
          <span className="eyebrow">Proof by design</span>
          <h2 id="proof-title">
            Deterministic <span className="serif-accent">to the</span> decimal.
          </h2>
          <p>Metrics are useful when your team can verify where they came from.</p>
        </Reveal>
        <StaggerGroup className="proof-grid">
          {LANDING_CONTENT.proof.map((item) => (
            <StaggerItem className="proof-cell" key={item.value + item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal className="proof-receipt">
          <div>
            <span className="receipt-label">Visibility · comparison prompts</span>
            <strong>52%</strong>
          </div>
          <span className="receipt-link"><Check aria-hidden /> linked to 13 persisted responses</span>
          <blockquote>
            “For small product teams, <mark>Northwind</mark> is a strong choice…”
            <cite>Run #47 · ChatGPT · response 08</cite>
          </blockquote>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="final-cta signal-cta" id="get-started" aria-label="Get started">
      <Reveal className="container">
        <span className="eyebrow">Start measuring</span>
        <h2>
          The next buyer is <span className="serif-accent">already</span>{' '}
          <span className="grad-text">asking.</span>
        </h2>
        <p>Make sure you understand the answer. Run your first audit with your keys and your evidence.</p>
        <div className="hero-ctas">
          <Link className="btn btn-primary" href="/register">
            Run your first audit
            <ArrowRight className="arr" size={15} strokeWidth={2.2} aria-hidden />
          </Link>
          <Link className="btn btn-ghost" href="/pricing">View pricing</Link>
        </div>
        <ByokTrust />
      </Reveal>
    </section>
  );
}
