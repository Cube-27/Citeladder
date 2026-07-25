import { Check, KeyRound, Link2, ShieldCheck } from 'lucide-react';

import { LANDING_CONTENT, type LandingFeature } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from './motion-primitives';

function FeatureVisual({ kind }: Readonly<{ kind: LandingFeature['key'] }>) {
  if (kind === 'share') {
    return (
      <div className="feature-bars" aria-hidden="true">
        <span><b>Northwind</b><i><em className="bar-46" /></i><strong>46%</strong></span>
        <span><b>ShelfMetrics</b><i><em className="bar-32" /></i><strong>32%</strong></span>
        <span><b>Loopboard</b><i><em className="bar-22" /></i><strong>22%</strong></span>
      </div>
    );
  }
  if (kind === 'scoring') {
    return <div className="feature-formula" aria-hidden="true"><span>mentions</span> + <span>citations</span> → <strong>score</strong></div>;
  }
  if (kind === 'evidence') {
    return <div className="feature-evidence" aria-hidden="true"><Link2 /><span>Metric</span><i /><span>Raw answer</span></div>;
  }
  if (kind === 'byok') {
    return <div className="feature-keys" aria-hidden="true"><KeyRound /><span>sk-••••••••</span><ShieldCheck /><b>encrypted</b></div>;
  }
  if (kind === 'health') return <div className="feature-health" aria-hidden="true"><span><Check /> Technical <b>84</b></span><span><Check /> AEO readiness <b>76</b></span></div>;
  if (kind === 'benchmark') return (
    <div className="feature-ranks" aria-hidden="true">
      <span><b>1</b> Northwind <strong>62.4</strong></span>
      <span><b>2</b> ShelfMetrics <strong>48.7</strong></span>
      <span><b>3</b> Loopboard <strong>45.2</strong></span>
    </div>
  );
  return (
    <div className="feature-trend" aria-hidden="true">
      <svg viewBox="0 0 300 84" preserveAspectRatio="none">
        <path pathLength="100" d="M2 66 L44 58 L86 61 L128 46 L170 49 L212 33 L254 36 L298 20" />
        <path className="trend-two" pathLength="100" d="M2 72 L44 70 L86 66 L128 62 L170 58 L212 55 L254 48 L298 44" />
      </svg>
    </div>
  );
}

export function FeaturesGrid() {
  return (
    <section className="features signal-features" id="features" aria-labelledby="features-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">The platform</span>
          <h2 className="h2" id="features-title">
            An audit, <span className="serif-accent">not</span> an opinion.
          </h2>
          <p>Everything your team needs to understand the answer—and improve what happens next.</p>
        </div>
        <StaggerGroup className="signal-bento">
          {LANDING_CONTENT.features.map((feature) => (
            <StaggerItem className={feature.wide ? 'signal-card is-wide' : 'signal-card'} key={feature.key}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              <FeatureVisual kind={feature.key} />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
