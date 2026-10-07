import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { platformLabel } from '@/lib/marketing-content/nav';
import { SOURCE_ROWS, HERO_COMPETITORS } from '../landing/landing-data';

/** Static excerpts of current product views. All records are synthetic; no app runtime is imported. */
function Ledger({
  title,
  columns,
  rows,
}: Readonly<{
  title: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}>) {
  return (
    <Table>
      <caption className="type-label text-muted p-4 text-left">{title}</caption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column} scope="col">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Finding() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4 p-6">
        <p className="type-label text-muted">Site Health · Page evidence</p>
        <h3 className="type-section-title">Indexing blocked by noindex</h3>
        <p className="type-body break-all">zernovelle.example/platform</p>
        <Badge>Needs review</Badge>
        <p className="type-body">
          Captured robots directive: <code>noindex, follow</code>
        </p>
        <p className="type-body text-muted">
          Confirm the intended indexing policy before changing the page.
        </p>
      </Card>
      <Card className="space-y-4 p-6">
        <p className="type-label text-muted">Robots policy · Retained observations</p>
        <h3 className="type-section-title">AI search access</h3>
        <dl className="type-body space-y-3">
          <div>
            <dt>Earlier observation</dt>
            <dd>Allowed</dd>
          </div>
          <div>
            <dt>Selected observation</dt>
            <dd>Allowed</dd>
          </div>
        </dl>
        <p className="type-body text-muted">
          Permission is policy evidence, not a recorded visit or citation.
        </p>
      </Card>
    </div>
  );
}

function Deliverable({ conversation = false }: Readonly<{ conversation?: boolean }>) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4 p-6">
        <p className="type-label text-muted">
          {conversation ? 'Agent conversation' : 'Context used'}
        </p>
        <h3 className="type-section-title">
          {conversation ? 'Prepare a developer brief for this page finding.' : 'Saved page finding'}
        </h3>
        <p className="type-body">
          Site Health: indexing blocked by noindex on zernovelle.example/platform.
        </p>
        <p className="type-body text-muted">
          The captured directive supports a finding. The intended indexing policy still needs
          confirmation.
        </p>
      </Card>
      <Card className="space-y-4 p-6">
        <p className="type-label text-muted">Output · Sources · History</p>
        <h3 className="type-section-title">Review the page indexing policy</h3>
        <Badge>Technical fix brief</Badge> <Badge>Revision 2</Badge>
        <p className="type-body">
          Confirm whether this product page should be indexed. If approved, remove the noindex
          directive and request a later crawl to check the captured result.
        </p>
        <p className="type-label text-muted">
          Source: saved page finding · Proposed work, not implemented
        </p>
      </Card>
    </div>
  );
}

function PreviewContent({ path }: Readonly<{ path: string }>): ReactNode {
  switch (path) {
    case '/platform/site-health':
      return <Finding />;
    case '/platform/agents':
      return <Deliverable conversation />;
    case '/platform/content-intelligence':
      return <Deliverable />;
    case '/platform/citation-intelligence':
      return (
        <div className="space-y-5">
          <Ledger
            title="Sources · Domains / URLs"
            columns={['Cited URL', 'Source type', 'Citations']}
            rows={SOURCE_ROWS.slice(0, 3).map((row) => [row.url, row.type, String(row.citations)])}
          />
          <p className="type-body">
            Answer context: “Which tools support multi-team workflows?” The answer mentions
            Zernovelle and references an independent comparison. A mention and an owned citation
            remain separate.
          </p>
        </div>
      );
    case '/platform/ai-referral-analytics':
      return (
        <div className="space-y-5">
          <Ledger
            title="AI Traffic · Referrals · Selected GA4 window"
            columns={['Source', 'Sessions', 'Engaged sessions', 'Key events']}
            rows={[
              ['ChatGPT', '42', '25', '4'],
              ['Perplexity', '18', '10', '1'],
            ]}
          />
          <Ledger
            title="Project-owned landing pages"
            columns={['Landing page', 'Sessions', 'Purchase revenue']}
            rows={[
              ['/platform', '35', 'USD 0'],
              ['/guides/workflows', '12', 'USD 0'],
            ]}
          />
          <p className="type-body text-muted">
            Identifiable sources only. Key events follow this property&apos;s configuration. Missing
            attribution remains unknown; page totals have a different scope from property totals.
          </p>
        </div>
      );
    case '/platform/demand-intelligence':
      return (
        <div className="grid gap-6 md:grid-cols-2">
          <Ledger
            title="Search Demand · Grouped by page"
            columns={['Query / page', 'Signal']}
            rows={[
              ['workflow software · /platform', 'Striking distance'],
              ['approval workflow · /guides/approvals', 'CTR gap'],
            ]}
          />
          <Card className="space-y-4 p-6">
            <h3 className="type-section-title">Supporting evidence</h3>
            <p className="type-body">
              Source: Google Search Console. Selected reporting window and owned landing page
              retained.
            </p>
            <p className="type-body">
              Action: investigate query-page relevance before preparing a proposed edit.
            </p>
            <p className="type-body text-muted">A CTR gap does not establish its cause.</p>
          </Card>
        </div>
      );
    case '/platform/search-intelligence':
      return (
        <div className="grid gap-6 md:grid-cols-2">
          <Ledger
            title="Saved research · Keywords / Competitors / Backlinks"
            columns={['Dataset', 'Target']}
            rows={[
              ['Ranked keywords', 'zernovelle.example'],
              ['Referring domains', 'zernovelle.example'],
              ['Competitor shared keywords', 'brelovanta.example'],
            ]}
          />
          <Card className="space-y-4 p-6">
            <p className="type-label text-muted">Acquisition review</p>
            <h3 className="type-section-title">Review scope before collection</h3>
            <dl className="type-body space-y-3">
              <div>
                <dt>Target</dt>
                <dd>zernovelle.example</dd>
              </div>
              <div>
                <dt>Market</dt>
                <dd>United States · English</dd>
              </div>
              <div>
                <dt>Selection</dt>
                <dd>Ranked keywords</dd>
              </div>
            </dl>
            <p className="type-body text-muted">
              The actual review includes a maximum cost. A separate confirmation authorizes
              collection.
            </p>
          </Card>
        </div>
      );
    case '/platform/commerce-intelligence':
      return (
        <div className="space-y-5">
          <Ledger
            title="Commerce · Selected catalog target"
            columns={['Target', 'Type', 'Buyer prompt']}
            rows={[['Trail pack', 'Product', 'Which daypacks suit a short hike?']]}
          />
          <Ledger
            title="AI Shelf · Supporting answer observations"
            columns={['Answer', 'Product appearance', 'Position evidence']}
            rows={[
              ['Selected answer', 'Trail pack mentioned', 'Explicitly ordered: 2'],
              ['Another answer', 'Trail pack mentioned', 'Unordered: unavailable'],
            ]}
          />
          <p className="type-body text-muted">
            Eligible commerce project. Position is only reported where ordering is supported; these
            are not purchase observations.
          </p>
        </div>
      );
    case '/platform/mcp':
      return (
        <Card className="space-y-5 p-6">
          <p className="type-label text-muted">Compatible assistant · Authorized saved evidence</p>
          <h3 className="type-section-title">Show the page findings supporting this Action.</h3>
          <blockquote className="border-border border-l pl-5">
            <p className="type-body">
              The saved Site Health observation records a noindex directive on the selected page.
              Check the intended indexing policy before proposing a change. This read has not
              recrawled the page.
            </p>
          </blockquote>
          <p className="type-label text-muted">
            Illustrative response excerpt · Account and project access required · No credentials
            shown
          </p>
        </Card>
      );
    case '/platform/integrations':
      return (
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <p className="type-label text-muted">Integrations · Property mapping</p>
            <h3 className="type-section-title">Zernovelle · Google Search Console</h3>
            <dl className="type-body space-y-3">
              <div>
                <dt>Project domain</dt>
                <dd>zernovelle.example</dd>
              </div>
              <div>
                <dt>Selected property</dt>
                <dd>sc-domain:zernovelle.example</dd>
              </div>
            </dl>
            <p className="type-body text-muted">
              Connection management requires an Owner or Admin. A mapped property does not establish
              complete reporting coverage.
            </p>
          </Card>
          <Ledger
            title="Connections · Purpose, setup and availability"
            columns={['Connection', 'Purpose', 'Setup / availability']}
            rows={[
              [
                'Google Search Console',
                'Query and page evidence',
                'Verified property and saved mapping',
              ],
              [
                'Google Analytics 4',
                'Sessions and reported outcomes',
                'Consent and property mapping',
              ],
              [
                'Bing Webmaster Tools',
                'Bing search evidence',
                'Separate consent and saved datasets',
              ],
              [
                'Model providers',
                'Available audits and Agent workflows',
                'Account access and provider configuration',
              ],
              [
                'DataForSEO',
                'Optional external research',
                'Scope, maximum cost and explicit confirmation',
              ],
              ['MCP', 'Read saved project evidence', 'Authorized compatible client'],
            ]}
          />
        </div>
      );
    default:
      return (
        <div className="space-y-5">
          <Ledger
            title="AI Visibility · Trends · Selected answer set"
            columns={['Brand', 'Visibility', 'Average supported position']}
            rows={HERO_COMPETITORS.map((row) => [
              row.name,
              `${row.visibility}%`,
              String(row.position),
            ])}
          />
          <Card className="space-y-3 p-6">
            <p className="type-label text-muted">Prompt portfolio · Workflow comparisons</p>
            <h3 className="type-section-title">Which tools support multi-team workflows?</h3>
            <p className="type-body">
              Inspect the selected answer, engine and cited sources before interpreting a change.
              Missing query fanout remains unavailable.
            </p>
          </Card>
        </div>
      );
  }
}

export function PlatformPreview({ path }: Readonly<{ path: string }>) {
  const advanced = path === '/platform/agents' || path === '/platform/content-intelligence';
  return (
    <figure className="min-w-0 space-y-4 text-left">
      <div className="bg-well rounded-card p-4 md:p-8">
        <PreviewContent path={path} />
      </div>
      <figcaption className="website-label text-muted">
        Illustrative example. {platformLabel(path) ?? 'AI Visibility'} · Synthetic records in a
        static product excerpt.
        {advanced && ' Advanced Agent workflow; not included in the current public trial.'}
      </figcaption>
    </figure>
  );
}
