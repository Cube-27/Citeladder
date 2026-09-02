import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PageHero } from '@/components/marketing/primitives/page-hero';
import { Section } from '@/components/marketing/primitives/section';
import { absoluteUrl } from '@/lib/seo/site';

const DESCRIPTION =
  'Connect ChatGPT, Claude, Codex, and Perplexity to read your CiteLadder business context.';

// The root layout appends '· CiteLadder', so the brand is not repeated here.
export const metadata: Metadata = {
  title: 'MCP server setup',
  description: DESCRIPTION,
  alternates: { canonical: '/docs/mcp' },
};

// No canonical origin is configured until the production domain is approved
// (lib/seo/site.ts). A placeholder host is honest about that; naming one
// deployment would send every other reader's assistant to the wrong server.
const MCP_ENDPOINT = absoluteUrl('/mcp') ?? 'https://<your-citeladder-host>/mcp';

const TOOLS = [
  ['list_projects', 'Discover every project available to the signed-in account.'],
  [
    'get_project_business_context',
    'Read the brand profile, prompt portfolio, Site Health, demand, opportunities, and visibility.',
  ],
  ['search', 'Search projects, opportunities, and prompts across the account.'],
  ['fetch', 'Open a complete record returned by search.'],
  ['read_site_health', 'Read the latest persisted Site Health scores and coverage.'],
  ['read_demand', 'Read the latest persisted demand snapshot and comparison.'],
  ['read_opportunities', 'Read the current priority-ranked opportunity roadmap.'],
  ['read_visibility_audit', 'Read the latest AI visibility audit.'],
  ['list_skills', 'Inspect CiteLadder content skills and Growth Agent capabilities.'],
] as const;

function Code({ children }: Readonly<{ children: string }>) {
  return (
    <pre className="border-border-subtle bg-background-alt overflow-x-auto rounded-[var(--radius-control)] border p-4 text-sm">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

function SetupSection({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: ReactNode }>) {
  return (
    <section id={id} className="border-border-subtle scroll-mt-24 border-t pt-8">
      <h2 className="website-feature-heading text-foreground">{title}</h2>
      <div className="website-body text-muted mt-4 grid max-w-3xl gap-4">{children}</div>
    </section>
  );
}

export default function McpDocumentationPage() {
  return (
    <main id="main">
      <PageHero
        eyebrow="Developer access"
        title="Connect your AI assistant to"
        accent="CiteLadder"
        lead="A hosted, read-only MCP server that gives supported assistants the persisted business context visible to your CiteLadder account."
      >
        <div className="mt-8 max-w-3xl">
          <Code>{MCP_ENDPOINT}</Code>
        </div>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="MCP guide" className="lg:sticky lg:top-28 lg:self-start">
            <p className="website-eyebrow text-foreground mb-4">On this page</p>
            <div className="grid gap-2 text-sm">
              {[
                ['overview', 'What it exposes'],
                ['chatgpt', 'ChatGPT'],
                ['claude', 'Claude'],
                ['codex', 'Codex'],
                ['perplexity', 'Perplexity'],
                ['security', 'Security'],
                ['examples', 'Example prompts'],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="text-muted hover:text-foreground rounded-[var(--radius-control)] py-1 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>

          <div className="grid gap-12">
            <SetupSection id="overview" title="What it exposes">
              <p>
                Access is account-scoped: after signing in, an assistant can discover every project
                available through that account&apos;s current workspace memberships. All responses
                come from persisted CiteLadder projections; an MCP read never starts a crawl, audit,
                sync, model call, publication, or external mutation.
              </p>
              <div className="border-border-subtle divide-border-subtle divide-y rounded-[var(--radius-control)] border">
                {TOOLS.map(([name, description]) => (
                  <div key={name} className="grid gap-1 p-4 sm:grid-cols-[15rem_1fr] sm:gap-5">
                    <code className="text-foreground font-mono text-xs">{name}</code>
                    <p>{description}</p>
                  </div>
                ))}
              </div>
            </SetupSection>

            <SetupSection id="chatgpt" title="ChatGPT">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open ChatGPT settings and add a custom remote MCP server or connector.</li>
                <li>Enter the endpoint shown above.</li>
                <li>Select OAuth when prompted, then sign in with the CiteLadder demo account.</li>
                <li>Start with “List my CiteLadder projects.”</li>
              </ol>
              <p>
                Connector availability depends on your ChatGPT plan and workspace administrator
                settings. No OpenAI API key is required by CiteLadder.
              </p>
            </SetupSection>

            <SetupSection id="claude" title="Claude and Claude Code">
              <p>
                In Claude, add a custom connector and use the endpoint above. Claude will open the
                CiteLadder OAuth login when it first connects.
              </p>
              <p>For Claude Code:</p>
              <Code>{`claude mcp add --transport http citeladder ${MCP_ENDPOINT}`}</Code>
              <p>
                Then run <code>/mcp</code> in Claude Code and complete the browser sign-in.
              </p>
            </SetupSection>

            <SetupSection id="codex" title="Codex">
              <p>Add the server, then start its OAuth login:</p>
              <Code>{`codex mcp add citeladder --url ${MCP_ENDPOINT}\ncodex mcp login citeladder`}</Code>
            </SetupSection>

            <SetupSection id="perplexity" title="Perplexity">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Open Connectors and choose a custom remote connector.</li>
                <li>Use the endpoint above and select OAuth authentication.</li>
                <li>Complete the CiteLadder sign-in to authorize the connection.</li>
              </ol>
              <p>Custom remote connectors may require a paid plan or administrator enablement.</p>
            </SetupSection>

            <SetupSection id="security" title="Security and demo access">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  The server requests only the <code>citeladder:read</code> scope.
                </li>
                <li>Each client receives its own revocable OAuth grant. API keys are not used.</li>
                <li>Every project read verifies a current workspace membership.</li>
                <li>Credentials and provider secrets are never returned through MCP.</li>
                <li>
                  This preview currently authorizes only the configured CiteLadder demo account.
                </li>
              </ul>
            </SetupSection>

            <SetupSection id="examples" title="Example prompts">
              <ul className="list-disc space-y-2 pl-5">
                <li>List every company and project available in my CiteLadder account.</li>
                <li>
                  Give me the full business context for this project before making recommendations.
                </li>
                <li>
                  What are the highest-priority opportunities, and which evidence supports them?
                </li>
                <li>Compare observed demand with the latest AI visibility audit.</li>
                <li>Which CiteLadder content skills are available for this company?</li>
              </ul>
            </SetupSection>
          </div>
        </div>
      </Section>
    </main>
  );
}
