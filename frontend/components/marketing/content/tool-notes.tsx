import { Fragment } from 'react';

import { FREE_TOOLS, TOOL_GUIDES } from '@/lib/marketing-content/tools';

import { ButtonLink } from '../primitives/button';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';

type FreeTool = (typeof FREE_TOOLS)[number];

function toolRow(tool: FreeTool) {
  return {
    title: tool.title,
    href: `/tools/${tool.slug}`,
    body: tool.description,
    meta: tool.input,
  };
}

export function toolGroups(tools: readonly FreeTool[] = FREE_TOOLS) {
  const groups = new Map<string, FreeTool[]>();
  for (const tool of tools) groups.set(tool.category, [...(groups.get(tool.category) ?? []), tool]);
  return [...groups.entries()].map(([category, items]) => ({
    title: category,
    items: items.map(toolRow),
  }));
}

export function otherTools(slug: FreeTool['slug']) {
  return [
    {
      id: 'more-tools',
      title: 'More free tools',
      items: FREE_TOOLS.filter((tool) => tool.slug !== slug).map(toolRow),
    },
  ];
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

export function ToolFacts() {
  return (
    <>
      {TOOL_FACTS.map((fact) => (
        <Fragment key={fact.title}>
          <h3>{fact.title}</h3>
          <p>{fact.body}</p>
        </Fragment>
      ))}
    </>
  );
}

export function SiteHealthCta() {
  return (
    <PageSection label="Site-wide evidence">
      <CtaBand
        title="Need evidence across your whole website?"
        lead="Site Health inspects captured page evidence across your site before you choose a fix."
        actions={<ButtonLink href="/platform/site-health">Explore Site Health</ButtonLink>}
      />
    </PageSection>
  );
}

export function ToolNotes({ slug }: Readonly<{ slug: FreeTool['slug'] }>) {
  const tool = FREE_TOOLS.find((entry) => entry.slug === slug);
  if (!tool) return null;
  const guide = TOOL_GUIDES[slug];
  return (
    <>
      {guide && (
        <>
          <h2>What it checks</h2>
          <ul>
            {guide.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
          <h2>How to read the results</h2>
          {guide.reading.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <h2>Questions, answered</h2>
          <FaqList items={guide.faqs.map((faq) => ({ question: faq.q, answer: faq.a }))} />
        </>
      )}
      <h2>What this tool can tell you</h2>
      <p>{tool.limitation}</p>
      <p>
        Need evidence across your website? Site Health inspects captured page evidence before you
        choose a fix.
      </p>
      <p>
        <a href="/platform/site-health">Explore Site Health</a>
      </p>
    </>
  );
}
