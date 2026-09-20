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
import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { CAPABILITIES, FAQS, INTEGRATIONS, WORKFLOW_STEPS, type ModuleId } from './landing-data';
import { Evidence } from './landing-evidence';
import { HeroPreview, PlatformExplorer } from './landing-previews';

function DemoLink() {
  return (
    <a
      className="cl-button cl-button-primary"
      href={DEMO_HREF}
      {...(DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {DEMO_CTA} <ArrowRight size={18} aria-hidden />
    </a>
  );
}

function Hero() {
  return (
    <header className="cl-hero">
      <div className="cl-wrap">
        <div className="cl-hero-copy">
          <span className="cl-eyebrow">AI search intelligence</span>
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
            <a className="cl-button cl-button-secondary" href="/register">
              Start free trial <ArrowRight size={18} aria-hidden />
            </a>
          </div>
          <p className="cl-hero-note">
            Source-level evidence &nbsp; · &nbsp; Provider-key control &nbsp; · &nbsp; MCP
            connectivity
          </p>
        </div>
        <HeroPreview />
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
            <svg viewBox="0 0 24 24" className="cl-engine-icon" aria-hidden="true">
              <path
                fill="var(--color-brand-google-blue)"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3h3.86c2.26-2.09 3.68-5.17 3.68-9.12z"
              />
              <path
                fill="var(--color-brand-google-green)"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="var(--color-brand-google-yellow)"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
              />
              <path
                fill="var(--color-brand-google-red)"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
            Google AI Overviews
          </span>
        </section>
      </div>
    </div>
  );
}

function Intelligence({ selectModule }: Readonly<{ selectModule: (module: ModuleId) => void }>) {
  return (
    <section className="cl-section cl-intelligence" id="why">
      <div className="cl-wrap">
        <span className="cl-eyebrow">Connected intelligence</span>
        <div className="cl-section-head">
          <h2>Visibility, sources and site readiness.</h2>
          <p>AI answers and website analysis, organized around shared business questions.</p>
        </div>
        <div className="cl-capabilities">
          {CAPABILITIES.map((capability) => (
            <article
              className={`cl-capability cl-capability-${capability.tone}`}
              key={capability.number}
            >
              <div className="cl-cap-top">
                <span>
                  {capability.number} / {capability.label}
                </span>
                <ArrowUpRight size={20} aria-hidden />
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
              <h3>{capability.title}</h3>
              <p>{capability.body}</p>
              <a
                className="cl-text-link"
                href="/#see-it"
                onClick={() => selectModule(capability.tab)}
              >
                {capability.action} <ArrowRight size={16} aria-hidden />
              </a>
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
        <span className="cl-eyebrow">The operating workflow</span>
        <div className="cl-section-head">
          <h2>From discovery to verification.</h2>
          <p>A repeatable sequence for measurement, analysis and content development.</p>
        </div>
        <div className="cl-steps">
          {WORKFLOW_STEPS.map(([number, title, body]) => (
            <article key={number}>
              <div className="cl-step-number">
                {number}
                <ArrowRight size={18} aria-hidden />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Integrations() {
  return (
    <section className="cl-section cl-integrations" id="integrations">
      <div className="cl-wrap">
        <span className="cl-eyebrow">Integrations</span>
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
  const teams = [
    [
      'Brand & growth',
      'Brand presence, competitor comparisons and citation patterns across relevant buyer questions.',
      'Brand performance',
      'visibility',
    ],
    [
      'Search & web',
      'Technical findings, page readiness and search demand for prioritizing website improvements.',
      'Website intelligence',
      'health',
    ],
    [
      'Content & editorial',
      'Source-backed briefs, drafts and structured data informed by observed content gaps.',
      'Content development',
      'content',
    ],
  ] as const;
  return (
    <section className="cl-section cl-teams" id="teams">
      <div className="cl-wrap">
        <span className="cl-eyebrow">Team workflows</span>
        <div className="cl-section-head">
          <h2>Shared context across teams.</h2>
          <p>
            Distinct responsibilities supported by a common record of observations and findings.
          </p>
        </div>
        <div className="cl-team-grid">
          {teams.map(([title, body, action, module]) => (
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
          <span className="cl-eyebrow">Operational control</span>
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
          <span className="cl-eyebrow">Product details</span>
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
          <a className="cl-button cl-button-secondary" href="/register">
            Start free trial <ArrowRight size={18} aria-hidden />
          </a>
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
