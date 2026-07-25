import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { ByokTrust } from './byok-trust';
import { Reveal } from './motion-primitives';

/**
 * LandingHero — eyebrow, the page's single <h1>, subcopy, primary/ghost CTAs
 * and the BYOK trust microcopy. Copy is verbatim from the approved mockup.
 */
export function LandingHero() {
  const { hero } = LANDING_CONTENT;
  return (
    <header className="hero signal-hero">
      <div className="hero-orbit" aria-hidden="true" />
      <div className="hero-inner container">
        <Reveal className="hero-copy">
          <span className="eyebrow">{hero.eyebrow}</span>
          <h1>
            {hero.title}
            <br />
            <span className="grad-text serif-accent">{hero.accent}</span>
          </h1>
          <p className="hero-sub">{hero.body}</p>
          <div className="hero-ctas">
            <Link className="btn btn-primary" href="/register">
              {hero.primaryCta}
              <ArrowRight className="arr" size={15} strokeWidth={2.2} aria-hidden />
            </Link>
            <a className="btn btn-ghost" href="#how-it-works">
              {hero.secondaryCta}
            </a>
          </div>
          <ByokTrust />
        </Reveal>

        <Reveal className="hero-stage">
          <div className="scene-stack">
          <div className="scene" aria-hidden="true">
            <div className="sc-head">
              <span className="sc-live"><i />Live audit</span>
              <span className="sc-title">Run #47 · all engines</span>
              <span className="sc-sample">Example data</span>
            </div>
            <div className="sc-body">
              <div className="sc-prompt">
                <span className="sc-chev">›</span>
                <span className="typed-wrap">best analytics platform for a D2C brand</span>
                <span className="caret" />
              </div>
              <div className="sc-engines">
                <span className="e-chip e-chatgpt"><i />ChatGPT</span>
                <span className="e-chip e-gemini"><i />Gemini</span>
                <span className="e-chip e-claude"><i />Claude</span>
              </div>
              <p className="sc-answer">
                <span className="chunk ck-1">The shortlist starts with </span>
                <span className="chunk ck-2"><span className="mention">Northwind Labs</span><sup>[1]</sup> for real-time cohorts.</span>
              </p>
              <div className="sc-hud">
                <div className="hud-ring">
                  <svg viewBox="0 0 76 76">
                    <circle className="ring-bg" cx="38" cy="38" r="26" />
                    <circle className="ring-fg" cx="38" cy="38" r="26" />
                  </svg>
                  <span className="hud-num"><b>78</b><small>score</small></span>
                </div>
                <div className="hud-right">
                  <div className="hud-chips">
                    <span className="hud-chip hc-owned">Mention · Northwind · #1</span>
                    <span className="hud-chip hc-owned">Citation · owned</span>
                  </div>
                  <div className="scene-share-row">
                    <span>Northwind</span><i><b /></i><strong>46%</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="sc-foot">
              <span>analyzer v3.2 · scoring rules v12</span>
              <span className="ok"><Check /> deterministic replay</span>
            </div>
          </div>
          {/* Decorative echoes of the scene above, which is itself aria-hidden.
              Announcing invented figures ("62.4%", "13 answers") as page
              content would read as a real result to a screen-reader user. */}
          <div className="float-card fc-1" aria-hidden="true">
            <span className="fc-label">Visibility · Northwind</span>
            <span><b className="fc-big">62.4%</b><i className="fc-delta">▲ 4.2</i></span>
            <svg className="fc-spark" viewBox="0 0 160 30">
              <path d="M2 24 L24 19 L46 21 L68 13 L90 15 L112 7 L134 9 L158 3" pathLength="100" />
            </svg>
          </div>
          <div className="float-card fc-2" aria-hidden="true">
            <span className="fc-check"><i><Check /></i><span><b>Evidence linked.</b><small>13 answers mention your brand</small></span></span>
          </div>
          <div className="float-card fc-4" aria-hidden="true">
            <span className="hud-chip hc-owned">Citation · owned · northwind.com</span>
          </div>
          </div>
        </Reveal>
      </div>
    </header>
  );
}
