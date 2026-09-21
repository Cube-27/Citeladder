'use client';

import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Link2,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { EngineLogo } from '../primitives/engine-logo';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import {
  CAPABILITIES,
  FAQS,
  INTEGRATIONS,
  TEAMS,
  WORKFLOW_STEPS,
  type ModuleId,
} from './landing-data';
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
          <h1>
            AI search intelligence.
            <br />
            <em>Shape how your brand shows up in AI.</em>
          </h1>
          <p>
            AI visibility, citation analysis, site readiness and content intelligence in one
            connected workspace.
          </p>
          <div className="cl-hero-actions">
            <DemoLink />
            <ButtonLink href="/register" variant="soft" size="marketing" className="cl-cta">
              Start free trial <ArrowRight size={18} aria-hidden />
            </ButtonLink>
          </div>
          <p className="cl-hero-note">
            Source-level evidence &nbsp; · &nbsp; Provider-key control &nbsp; · &nbsp; MCP
            connectivity
          </p>
        </div>
        <div className="cl-hero-stage">
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
            ChatGPT
          </span>
          <span>
            <EngineLogo engine="gemini" className="cl-engine-icon" />
            Gemini
          </span>
          <span>
            <EngineLogo engine="claude" className="cl-engine-icon" />
            Claude
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

function Intelligence({ selectModule }: Readonly<{ selectModule: (module: ModuleId) => void }>) {
  return (
    <section className="cl-section" id="why">
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>Visibility, sources and site readiness.</h2>
          <p>AI answers and website analysis, organized around shared business questions.</p>
        </div>
        <div className="cl-capabilities">
          {CAPABILITIES.map((capability) => (
            <article className="cl-capability" key={capability.tab}>
              <div className="cl-cap-well">
                <div className="cl-cap-top">
                  <span>{capability.label}</span>
                </div>
                <div className="cl-cap-graphic" aria-hidden>
                  {capability.tab === 'visibility' ? (
                    <>
                      <strong>64.4%</strong>
                      <span>Brand visibility</span>
                      <div className="cl-stacked-bars">
                        <i />
                        <i />
                        <i />
                      </div>
                    </>
                  ) : capability.tab === 'sources' ? (
                    <>
                      <div>
                        <span>Owned sources</span>
                        <i style={{ width: '82%' }} />
                      </div>
                      <div>
                        <span>Review sources</span>
                        <i style={{ width: '64%' }} />
                      </div>
                      <div>
                        <span>Editorial sources</span>
                        <i style={{ width: '43%' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Check size={16} />
                        Crawl access <span>Passed</span>
                      </div>
                      <div>
                        <Check size={16} />
                        Page structure <span>Passed</span>
                      </div>
                      <div>
                        <ShieldCheck size={16} />
                        Structured data <span>Review</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="cl-cap-body">
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
                <a
                  className="cl-text-link"
                  href="/#see-it"
                  onClick={() => selectModule(capability.tab)}
                >
                  {capability.action} <ArrowRight size={16} aria-hidden />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="cl-section cl-workflow" id="how-it-works">
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>From discovery to verification.</h2>
          <p>A repeatable sequence for measurement, analysis and content development.</p>
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
          <h2>Part of the existing marketing stack.</h2>
          <p>
            First-party analytics, AI providers and connected tools contribute distinct context to
            the workspace.
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
        <a className="cl-text-link" href="/pricing">
          Provider-key and pricing details <ArrowUpRight size={16} aria-hidden />
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
          <h2>AI search intelligence, in one workspace.</h2>
          <p>
            See brand visibility, source analysis, website readiness and evidence-backed content
            workflows in one working session.
          </p>
        </div>
        <div className="cl-closing-actions">
          <DemoLink />
          <ButtonLink href="/register" variant="dark" size="marketing" className="cl-cta">
            Start free trial <ArrowRight size={18} aria-hidden />
          </ButtonLink>
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
      <Intelligence selectModule={setModule} />
      <Workflow />
      <PlatformExplorer selected={module} selectModule={setModule} />
      <Evidence />
      <Integrations />
      <Teams selectModule={setModule} />
      <Enterprise />
      <Faq />
      <Closing />
    </div>
  );
}
