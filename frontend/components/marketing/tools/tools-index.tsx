import {
  ArrowRight,
  FileCode2,
  ListFilter,
  Route,
  ScanSearch,
  Share2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { FREE_TOOLS } from '@/lib/marketing-content/tools';

import { ButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';

type FreeTool = (typeof FREE_TOOLS)[number];

const TOOL_ICONS: Record<FreeTool['slug'], LucideIcon> = {
  'ai-crawler-checker': ScanSearch,
  'robots-txt-generator': ShieldCheck,
  'meta-directive-checker': FileCode2,
  'structured-data-builder': Route,
  'sitemap-comparison': ListFilter,
  'social-preview': Share2,
};

/** Tools grouped by category, in catalog order. */
function toolGroups(tools: readonly FreeTool[]) {
  const groups = new Map<string, FreeTool[]>();
  for (const tool of tools) groups.set(tool.category, [...(groups.get(tool.category) ?? []), tool]);
  return [...groups.entries()];
}

function ToolRow({ tool }: Readonly<{ tool: FreeTool }>) {
  const Icon = TOOL_ICONS[tool.slug];
  return (
    <a href={`/tools/${tool.slug}`} className="cp-tool-row focus-ring">
      <span className="nav-row-icon">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="cp-link-title">{tool.title}</span>
        <span className="cp-link-desc">{tool.description}</span>
      </span>
      <span className="cp-tool-row-input">{tool.input}</span>
      <ArrowRight aria-hidden className="size-4" />
    </a>
  );
}

function ToolDirectory({ tools }: Readonly<{ tools: readonly FreeTool[] }>) {
  return (
    <div className="cp-tool-groups">
      {toolGroups(tools).map(([category, items]) => (
        <div key={category} className="cp-tool-group">
          <h3 className="website-small-heading">{category}</h3>
          <ul className="cp-tool-list">
            {items.map((tool) => (
              <li key={tool.slug}>
                <ToolRow tool={tool} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const TOOL_FACTS = [
  {
    title: 'Runs in your browser',
    body: 'Your pasted text and files are not uploaded or saved by these tools.',
  },
  {
    title: 'Reads only what you supply',
    body: 'No website is fetched. A result does not prove indexing, rankings or AI citations.',
  },
  {
    title: 'No account needed',
    body: 'No signup, API credits or website connection.',
  },
] as const;

export function ToolsIndex() {
  return (
    <>
      <PageHero
        title="Free tools for crawler rules and page markup."
        lead="Test robots.txt rules, inspect indexing directives and build cleaner markup. Six focused tools that process your input in your browser."
      >
        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink href="/tools/ai-crawler-checker">
            Test your rules <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </PageHero>
      <Section tone="soft" aria-label="All free tools">
        <SectionHeader
          title="Pick the task in front of you."
          lead="Paste text, enter details or choose a local file."
        />
        <ToolDirectory tools={FREE_TOOLS} />
      </Section>
      <Section aria-labelledby="tools-limits-title">
        <div className="mk-split">
          <SectionHeader headingId="tools-limits-title" title="Small checks. Clear limits." />
          <ul className="cp-facts">
            {TOOL_FACTS.map((fact) => (
              <li key={fact.title}>
                <h3 className="website-feature-heading">{fact.title}</h3>
                <p className="website-body text-muted">{fact.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section className="marketing-closing-band" aria-label="Site-wide evidence">
        <div className="flex flex-col items-center gap-9">
          <SectionHeader
            align="center"
            title="Need evidence across your whole website?"
            lead="Site Health inspects captured page evidence across your site, so you can choose a correction with the full picture."
          />
          <ButtonLink href="/platform/site-health">
            Explore Site Health <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}

/**
 * The band under a tool: what the result can and cannot establish, then the
 * other tools. Rendered by `/tools/[slug]`.
 */
export function ToolNotes({ slug }: Readonly<{ slug: FreeTool['slug'] }>) {
  const tool = FREE_TOOLS.find((entry) => entry.slug === slug);
  if (!tool) return null;
  const others = FREE_TOOLS.filter((entry) => entry.slug !== slug);
  return (
    <>
      <Section aria-labelledby="tool-limits-title">
        <div className="mk-split">
          <SectionHeader headingId="tool-limits-title" title="What this tool can tell you" />
          <div className="grid content-start gap-5">
            <p className="website-body-lg max-w-[60ch]">{tool.limitation}</p>
            <p className="website-body text-muted max-w-[60ch]">
              Need evidence across your website? Site Health inspects captured page evidence before
              you choose a correction.
            </p>
            <a className="mk-text-link focus-ring rounded-xs" href="/platform/site-health">
              Explore Site Health
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </div>
        </div>
      </Section>
      <Section tone="soft" rhythm="tight" aria-labelledby="tool-related-title">
        <SectionHeader headingId="tool-related-title" title="More free tools" size="h3" />
        <nav aria-labelledby="tool-related-title">
          <ul className="cp-tool-list">
            {others.map((entry) => (
              <li key={entry.slug}>
                <ToolRow tool={entry} />
              </li>
            ))}
          </ul>
        </nav>
      </Section>
    </>
  );
}
