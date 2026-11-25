import { Badge } from '@/components/ui/badge';
import { Citation } from '@/components/ui/citation';
import { pluralCount } from '@/lib/format';

import { ACTION_STATUS_TONE, ACTIONS, CONTENT_WORK, SHELF, type ActionStatus } from './demo-data';
import { Vignette, VignetteRows, fourRows } from './screen-vignette';

const quoted = (kind: string) => kind === 'Prompt' || kind === 'Search query';

function StatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  return (
    <Badge tone={ACTION_STATUS_TONE[status]} dot={status !== 'Open' && status !== 'Dismissed'}>
      {status}
    </Badge>
  );
}

const LISTED_ACTIONS = [0, 1, 2, 3].flatMap((index) => ACTIONS[index] ?? []);

export function ScreenActions() {
  return (
    <Vignette
      title="Actions"
      meta="acme.com · highest priority first"
      badge={<Badge>21 actions</Badge>}
    >
      <VignetteRows
        label="Actions, highest priority first"
        rows={fourRows(LISTED_ACTIONS, (row) => ({
          key: row.target,
          label: quoted(row.kind) ? `“${row.target}”` : row.target,
          secondary: `${row.kind} · ${row.approach}`,
          extra: <span className="cl-vig-muted">{row.priority}</span>,
          value: <StatusBadge status={row.status} />,
        }))}
      />
    </Vignette>
  );
}

export function ScreenContentOptimization() {
  return (
    <Vignette
      title="Content gaps in Actions"
      meta="acme.com · content pages and planned pages"
      badge={<Badge>{`${CONTENT_WORK.length} open`}</Badge>}
    >
      <VignetteRows
        label="Content work, highest priority first"
        rows={fourRows(CONTENT_WORK, (row) => ({
          key: row.page,
          label: row.page,
          secondary: [
            row.planned ? 'Planned page' : row.angle,
            pluralCount(row.sites, 'site'),
            pluralCount(row.competitors, 'competitor'),
          ].join(' · '),
          value: pluralCount(row.prompts, 'prompt'),
        }))}
      />
    </Vignette>
  );
}

export function ScreenAgentChat() {
  return (
    <Vignette title="Agent" meta="acme.com · today, 09:14" badge={<Badge>Chat</Badge>}>
      <div className="cl-vig-panel">
        <p className="cl-vig-user">Why did we drop on Gemini this week?</p>
        <p>
          Gemini named you in 36 of 120 answers, down from 43. Since 29 Oct robots.txt blocks
          Google-Extended on /docs/, so Gemini cites northwind.io instead.
        </p>
        <div className="cl-vig-chips">
          <Citation domain="acme.com" title="/docs/setup" own />
          <Citation domain="northwind.io" title="/docs" />
        </div>
        <div className="cl-vig-added">
          <Badge tone="accent">Action added</Badge>
          <span className="cl-vig-label">Let Gemini read /docs/ again</span>
        </div>
      </div>
    </Vignette>
  );
}

export function ScreenAgentBrief() {
  return (
    <Vignette
      title="Session replay pricing page"
      meta="Content brief · drafted by the Agent, 2 Nov"
      badge={<Badge>Draft</Badge>}
    >
      <div className="cl-vig-panel">
        <p>Acme is named in 1 of 4 answers to “Cheapest analytics with session replay”.</p>
        <div>
          <p className="cl-vig-label">Outline</p>
          <ol className="cl-vig-outline">
            <li>What session replay costs on each plan</li>
            <li>The Startup plan beside Northwind and Lumen</li>
            <li>Recordings per month and retention</li>
          </ol>
        </div>
        <div className="cl-vig-chips cl-vig-foot">
          <Citation domain="northwind.io" title="/pricing" />
          <Citation domain="g2.com" title="/compare" />
        </div>
      </div>
    </Vignette>
  );
}

export function ScreenCommerce() {
  return (
    <Vignette
      title="Acme Startup on the AI shelf"
      meta="Product analytics · 48 answers this week"
      badge={<Badge tone="accent">Share of shelf 24%</Badge>}
    >
      <VignetteRows
        label="Products recommended in 48 answers"
        rows={fourRows(SHELF, (entry) => ({
          key: entry.product,
          label: entry.product,
          secondary: entry.own ? `${entry.domain} · You` : entry.domain,
          extra: <span className="cl-vig-muted">{`Best #${entry.best}`}</span>,
          value: `${entry.answers} of 48`,
        }))}
      />
    </Vignette>
  );
}
