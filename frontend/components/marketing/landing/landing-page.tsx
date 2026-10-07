'use client';

import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  FileText,
  Link2,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { EngineLogo } from '../primitives/engine-logo';
import { DemoButtonLink } from '../primitives/button';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { PlatformActions, PlatformCards } from '../pages/platform';
import { PlatformPreview } from '../scenes/platform-preview';
import { TRIAL_NOTE } from '@/lib/marketing-content/platform-pages';

import { FAQS, INTEGRATIONS, TEAMS, WORKFLOW_STEPS, type ModuleId } from './landing-data';
import { Evidence } from './landing-evidence';
import { HeroPreview, PlatformExplorer } from './landing-previews';

function DemoLink() {
  return (
    <DemoButtonLink size="marketing" className="cl-cta">
      {DEMO_CTA} <ArrowRight size={18} aria-hidden />
    </DemoButtonLink>
  );
}

function Hero() {
  return (
    <header className="cl-hero">
      <div className="cl-wrap">
        <div className="cl-hero-copy">
          <span className="cl-overline">
            AI visibility, website intelligence and content workflows
          </span>
          <h1>Understand your AI visibility. Know what to improve next.</h1>
          <p>
            CiteLadder connects the answers that mention your brand with the sources, website
            findings and search data behind your next decision. Track visibility, investigate gaps
            and prepare improvements your team can review.
          </p>
          <div className="cl-hero-actions" data-cta-placement="hero">
            <PlatformActions path="/" />
          </div>
          <p className="cl-hero-note">{TRIAL_NOTE}</p>
          <p className="cl-hero-note">
            AI Visibility · Citations · Site Health · Search Intelligence · AI Referrals · Agent
            &amp; MCP
          </p>
        </div>
        <div className="cl-hero-stage marketing-snapshot-grain">
          <HeroPreview />
        </div>
      </div>
    </header>
  );
}

function EngineStrip() {
  return (
    <div className="cl-engine-strip">
      <div className="cl-wrap cl-engine-inner">
        <p>
          AI ANSWER
          <br />
          MONITORING
        </p>
        <section className="cl-engines" aria-label="Monitored answer engines">
          <span>
            <EngineLogo engine="openai" className="cl-engine-icon" />
            OpenAI API
          </span>
          <span>
            <EngineLogo engine="gemini" className="cl-engine-icon" />
            Gemini API
          </span>
          <span>
            <EngineLogo engine="claude" className="cl-engine-icon" />
            Claude API
          </span>
          <span>
            <EngineLogo engine="google" className="cl-engine-icon" />
            Google AI Overviews
          </span>
        </section>
      </div>
    </div>
  );
}

function Intelligence() {
  return (
    <section className="cl-section" id="why">
      <div className="cl-wrap">
        <div className="cl-section-head cl-section-head-wide">
          <h2>More than another visibility chart</h2>
          <p>
            An AI answer is only one part of the picture. Your team also needs to know which sources
            appeared, what your own pages communicate and which visits reached your website.
            CiteLadder keeps those observations connected without treating them as the same metric.
          </p>
        </div>
        <div className="space-y-8">
          <h2 className="website-section-heading">
            Discover what your team can measure, diagnose and improve
          </h2>
          <PlatformCards />
        </div>
      </div>
    </section>
  );
}

function ConnectedEvidence() {
  return (
    <section className="cl-section">
      <div className="cl-wrap space-y-12">
        <div className="cl-section-head cl-section-head-wide">
          <h2>Keep different signals distinct</h2>
          <p>
            <strong>A mention</strong> shows that a brand appeared in a collected answer.{' '}
            <strong>A citation</strong> shows a source reference.{' '}
            <strong>A referral session</strong> shows an identifiable visit reported by connected
            analytics. These observations answer different questions; none alone proves a sale or
            explains why an engine selected a source.
          </p>
        </div>
        <PlatformPreview path="/platform/site-health" />
        <PlatformPreview path="/platform/agents" />
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="cl-section cl-workflow" id="how-it-works">
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>From an observation to a reviewable improvement</h2>
        </div>
        <ol className="cl-steps">
          {WORKFLOW_STEPS.map(([number, title, body]) => (
            <li key={number}>
              <span className="cl-step-number">{number}</span>
              <div className="cl-step-copy">
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Integrations() {
  return (
    <section className="cl-section cl-integrations" id="integrations">
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>Start small. Connect more evidence when it helps.</h2>
          <p>
            Begin with the AI questions you need to understand. Add website diagnostics, first-party
            search data and other available connections as your work requires them. Explore advanced
            content and Agent workflows in a demo.
          </p>
        </div>
        <div className="cl-integration-grid">
          {INTEGRATIONS.map(([icon, title, body]) => (
            <article key={title}>
              <span className="cl-integration-icon" aria-hidden>
                {icon}
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
        <a className="cl-text-link" href="/platform/integrations">
          Explore integrations <ArrowUpRight size={16} aria-hidden />
        </a>
      </div>
    </section>
  );
}

function Teams({ selectModule }: Readonly<{ selectModule: (module: ModuleId) => void }>) {
  return (
    <section className="cl-section cl-teams" id="teams">
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>Shared context across teams.</h2>
          <p>
            Distinct responsibilities supported by a common record of observations and findings.
          </p>
        </div>
        <div className="cl-team-grid">
          {TEAMS.map(([title, body, action, module]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
              <a className="cl-text-link" href="/#see-it" onClick={() => selectModule(module)}>
                {action} <ArrowRight size={16} aria-hidden />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Enterprise() {
  const items = [
    [
      ShieldCheck,
      'Workspace isolation',
      'Customer information scoped to the relevant workspace and project.',
    ],
    [
      Search,
      'Provider credential control',
      'Encrypted provider secrets resolved for authorized execution.',
    ],
    [
      FileText,
      'Retained analysis records',
      'Answers, source context and subsequent observations remain inspectable.',
    ],
    [
      Link2,
      'Implementation support',
      'Onboarding, deployment and ongoing support scoped to the engagement.',
    ],
  ] as const;
  return (
    <section className="cl-section cl-enterprise" id="trust">
      <div className="cl-wrap cl-enterprise-grid">
        <div>
          <h2>Project-level control. Source-level accountability.</h2>
          <p>
            Scoped access, provider credential controls and retained records support a governed AI
            search workflow.
          </p>
          <DemoLink />
        </div>
        <div className="cl-governance">
          {items.map(([Icon, title, body]) => (
            <article key={title}>
              <Icon size={22} aria-hidden />
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="cl-section cl-faq" id="landing-faq">
      <div className="cl-wrap cl-faq-grid">
        <div>
          <h2>Frequently asked questions.</h2>
          <a className="cl-text-link" href="/faq">
            All product questions <ArrowUpRight size={16} aria-hidden />
          </a>
        </div>
        <div>
          {FAQS.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={20} aria-hidden />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="cl-section cl-closing" id="get-started">
      <div className="cl-wrap cl-closing-grid">
        <div>
          <h2>See the product in the context of your business</h2>
          <p>
            Bring your website and a few questions your buyers ask. Explore how CiteLadder connects
            visibility evidence with a practical next step.
          </p>
        </div>
        <div className="cl-closing-actions">
          <PlatformActions path="/" />
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [module, setModule] = useState<ModuleId>('sources');
  return (
    <div className="cl-landing">
      <Hero />
      <EngineStrip />
      <Intelligence />
      <Workflow />
      <PlatformExplorer selected={module} selectModule={setModule} />
      <ConnectedEvidence />
      <Evidence />
      <Integrations />
      <Teams selectModule={setModule} />
      <Enterprise />
      <Faq />
      <Closing />
    </div>
  );
}
