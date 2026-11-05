import { Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Citation } from '@/components/ui/citation';
import { cn } from '@/lib/utils';

import { ACTION_STATUS_TONE, ACTIONS, SHELF, type ActionStatus } from './demo-data';
import { ScreenButton, ScreenCard, ScreenMeta, ScreenRoot } from './screen-parts';
import { VignetteCard, VignetteRows } from './screen-vignette';

const quoted = (kind: string) => kind === 'Prompt' || kind === 'Search query';

function StatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  return (
    <Badge tone={ACTION_STATUS_TONE[status]} dot={status !== 'Open' && status !== 'Dismissed'}>
      {status}
    </Badge>
  );
}

/** The actions the list shows: the top of the priority order. */
const LISTED_ACTIONS = ACTIONS.slice(0, 7);

/** Actions: the work list, highest priority first, each with its approach and status. */
export function ScreenActions() {
  return (
    <ScreenRoot name="actions" width={800} height={500}>
      <ScreenCard
        title="Actions"
        meta="Highest priority first · 7 of 21 actions"
        action={<ScreenMeta>Updated today, 06:20 UTC</ScreenMeta>}
      >
        <ul className="cl-screen-alist">
          {LISTED_ACTIONS.map((row) => (
            <li key={row.target} className="cl-screen-arow">
              <span className="cl-screen-lines">
                <span className={cn('cl-screen-strong', !quoted(row.kind) && 'cl-screen-mono')}>
                  {quoted(row.kind) ? `“${row.target}”` : row.target}
                </span>
                <span className="cl-screen-muted">{`${row.kind} · ${row.approach}`}</span>
              </span>
              <span className="cl-screen-muted">{row.priority}</span>
              <StatusBadge status={row.status} />
            </li>
          ))}
        </ul>
      </ScreenCard>
    </ScreenRoot>
  );
}

/** The Agent answering "Why did we drop on Gemini this week?" and the action it added. */
export function ScreenAgentChat() {
  return (
    <ScreenRoot name="agent-chat" width={480} height={320}>
      <p className="cl-screen-user">Why did we drop on Gemini this week?</p>
      <div className="cl-screen-reply">
        <p>
          Gemini named you in 36 of 120 answers, down from 43. Since 29 Oct robots.txt blocks
          Google-Extended on /docs/, so Gemini cites northwind.io instead.
        </p>
        <div className="cl-screen-chips">
          <Citation domain="acme.com" title="/docs/setup" own />
          <Citation domain="northwind.io" title="/docs" />
        </div>
      </div>
      <div className="cl-screen-added">
        <Badge tone="accent">Action added</Badge>
        <span className="cl-screen-strong">Let Gemini read /docs/ again</span>
        <ScreenMeta>High · 09:14</ScreenMeta>
      </div>
    </ScreenRoot>
  );
}

/** A content brief the Agent drafted: its reason and the sources answers cite now. */
export function ScreenAgentBrief() {
  return (
    <ScreenRoot name="agent-brief" width={480} height={320}>
      <ScreenCard
        title="Session replay pricing page"
        meta="Content brief · drafted by the Agent, 2 Nov"
        action={<ScreenButton icon={Download}>Export</ScreenButton>}
      >
        <div className="cl-screen-prose">
          <p>Acme is named in 1 of 4 answers to “Cheapest analytics with session replay”.</p>
          <p className="cl-screen-prose-heading">Outline</p>
          <ol>
            <li>What session replay costs on each plan</li>
            <li>The Startup plan beside Northwind and Lumen</li>
            <li>Recordings per month and retention</li>
          </ol>
          <div className="cl-screen-chips">
            <Citation domain="northwind.io" title="/pricing" />
            <Citation domain="g2.com" title="/compare" />
          </div>
        </div>
      </ScreenCard>
    </ScreenRoot>
  );
}

/** Commerce: who held the AI shelf for one product, the products answers recommended. */
export function ScreenCommerce() {
  return (
    <ScreenRoot name="commerce" width={480} height={360}>
      <VignetteCard title="Acme Startup on the AI shelf" badge={<Badge>48 answers</Badge>}>
        <VignetteRows layout="shelf" rows={SHELF} rowKey={(entry) => entry.product}>
          {(entry) => (
            <>
              <BrandMark name={entry.brand} />
              <span className="cl-screen-lines">
                <span className="cl-screen-strong">{entry.product}</span>
                <span className="cl-screen-muted">{entry.domain}</span>
              </span>
              <span className="cl-screen-muted">{`In ${entry.answers} of 48`}</span>
              <Badge tone={entry.own ? 'accent' : 'neutral'}>
                {entry.own ? 'You' : 'Competitor'}
              </Badge>
            </>
          )}
        </VignetteRows>
      </VignetteCard>
    </ScreenRoot>
  );
}
