import {
  ArrowRight,
  FileCode2,
  ScanSearch,
  Route,
  Share2,
  ListFilter,
  ShieldCheck,
} from 'lucide-react';
import { FREE_TOOLS } from '@/lib/marketing-content/tools';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { ButtonLink } from '../primitives/button';

const icons = [ScanSearch, ShieldCheck, FileCode2, Route, ListFilter, Share2];
export function ToolsIndex() {
  return (
    <>
      <PageHero
        eyebrow="Free tools · No signup"
        title="A clearer view of your website."
        lead="Test crawler rules, inspect page declarations and prepare better markup. Six focused tools, with your input processed right in your browser."
      />
      <Section rhythm="tight" aria-label="Start here">
        <div className="border-border-subtle bg-canvas-soft flex flex-col items-start gap-6 rounded-[var(--radius-card)] border p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="website-eyebrow text-accent-text">Start with crawl access</p>
            <h2 className="website-section-heading">What do your crawler rules actually allow?</h2>
            <p className="website-body text-muted">
              Test a page against your robots.txt and see the exact matching rule for each crawler.
              Keep search discovery and training permissions distinct.
            </p>
          </div>
          <ButtonLink href="/tools/ai-crawler-checker">
            Test your rules <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </Section>
      <Section rhythm="tight" aria-label="All free tools">
        <SectionHeader
          title="Choose the task in front of you."
          lead="Paste text, enter details or choose a local file. No API credits, account or website connection needed."
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FREE_TOOLS.map((tool, index) => {
            const Icon = icons[index];
            return (
              <a
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="surface-card border-border-subtle group flex flex-col gap-4 rounded-[var(--radius-card)] border p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <Icon className="text-accent-text size-6" aria-hidden />
                  <span className="website-label text-muted">{tool.category}</span>
                </div>
                <h3 className="website-feature-heading">{tool.title}</h3>
                <p className="website-body text-muted flex-1">{tool.description}</p>
                <span className="website-label text-accent-text flex items-center justify-between gap-3">
                  {tool.input}
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </a>
            );
          })}
        </div>
      </Section>
      <Section tone="sunken">
        <SectionHeader
          title="Small checks. Clear limits."
          lead="These tools inspect what you supply. They do not fetch websites or prove indexing, rankings or AI citations. Your pasted text and files are not uploaded or saved by these tools."
        />
        <ButtonLink href="/solutions">
          Explore site-wide evidence in CiteLadder <ArrowRight aria-hidden />
        </ButtonLink>
      </Section>
    </>
  );
}
