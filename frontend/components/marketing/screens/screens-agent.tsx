import { ArrowUp, Copy, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Citation } from '@/components/ui/citation';
import { FactList } from '@/components/ui/facts';
import { StepList } from '@/components/ui/step-list';
import { cn } from '@/lib/utils';

import { ACTION_STATUS_TONE, ACTIONS, SHELF, type ActionStatus } from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCols,
  ScreenMeta,
  ScreenRoot,
  ScreenSection,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';
import { VignetteCard, VignetteRows } from './screen-vignette';

const quoted = (kind: string) => kind === 'Prompt' || kind === 'Search query';

function StatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  return (
    <Badge tone={ACTION_STATUS_TONE[status]} dot={status !== 'Open' && status !== 'Dismissed'}>
      {status}
    </Badge>
  );
}

const ACTION_COLUMNS: readonly ScreenColumn<(typeof ACTIONS)[number]>[] = [
  {
    header: 'Target',
    cell: (row) => (
      <span className="cl-screen-target">
        <span className={cn('cl-screen-strong', !quoted(row.kind) && 'cl-screen-mono')}>
          {quoted(row.kind) ? `“${row.target}”` : row.target}
        </span>
        <span className="cl-screen-muted">{row.kind}</span>
      </span>
    ),
  },
  { header: 'Status', width: 'md', cell: (row) => <StatusBadge status={row.status} /> },
  { header: 'Priority', width: 'sm', cell: (row) => row.priority },
  {
    header: 'Approach',
    width: 'xl',
    cell: (row) => <span className="cl-screen-muted">{row.approach}</span>,
  },
];

/** Actions: prioritised work with its linked evidence, one action open beside the list. */
export function ScreenActions() {
  return (
    <ScreenRoot name="actions" width={1200} height={680}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[
              { label: 'All', count: 21 },
              { label: 'Open and in progress', count: 5 },
              { label: 'Measuring', count: 1 },
              { label: 'Done', count: 12 },
              { label: 'Dismissed', count: 3 },
            ]}
            selected="All"
          />
        }
        end={<ScreenMeta>Updated today, 06:20 UTC</ScreenMeta>}
      />
      <ScreenCols layout="actions">
        <ScreenTableCard title="Actions" meta="Highest priority first · 9 of 21 actions">
          <ScreenTable
            caption="Actions for acme.com"
            rows={ACTIONS}
            rowKey={(row) => row.target}
            selected={(row) => row.target === 'acme.com/docs/setup'}
            columns={ACTION_COLUMNS}
          />
        </ScreenTableCard>
        <ScreenCard
          eyebrow="High priority · Site Health"
          title="Let Gemini read /docs/ again"
          action={<Badge>Open</Badge>}
        >
          <div className="cl-screen-detail">
            <FactList
              layout="ruled"
              facts={[
                {
                  label: 'Target',
                  value: <span className="cl-screen-mono">acme.com/docs/setup</span>,
                },
                { label: 'Approach', value: 'Fix a technical issue' },
                { label: 'Affects', value: '14 pages, 9 prompts' },
              ]}
            />
            <ScreenSection label="Diagnosis">
              <p className="cl-screen-body">
                robots.txt has disallowed Google-Extended on /docs/ since 29 Oct. Gemini cited
                /docs/setup in 9 answers last week and 2 this week.
              </p>
            </ScreenSection>
            <ScreenSection label="Evidence">
              <div className="cl-screen-chips">
                <Citation domain="acme.com" title="/robots.txt" own />
                <Citation domain="northwind.io" title="/docs" />
              </div>
            </ScreenSection>
            <ScreenSection label="Measure with">
              <StepList
                label="Verification checks"
                steps={[
                  { label: 'Site Health check passes', status: 'pending' },
                  { label: 'Prompt score rises on Gemini', status: 'pending' },
                ]}
              />
            </ScreenSection>
            <div className="cl-screen-actions">
              <ScreenButton variant="primary">Work on this</ScreenButton>
              <ScreenButton variant="ghost">Dismiss</ScreenButton>
            </div>
          </div>
        </ScreenCard>
      </ScreenCols>
    </ScreenRoot>
  );
}

/** The Agent answering "Why did we drop on Gemini this week?" and the action it added. */
export function ScreenAgentChat() {
  return (
    <ScreenRoot name="agent-chat" width={960} height={600}>
      <div className="cl-screen-chat">
        <div className="cl-screen-thread">
          <p className="cl-screen-user">Why did we drop on Gemini this week?</p>
          <StepList
            label="What the Agent checked"
            steps={[
              {
                label: 'Compared cited sources on Gemini',
                detail: 'acme.com/docs/setup: 9 answers → 2',
                status: 'done',
                time: '2.4s',
              },
              {
                label: 'Read robots.txt history',
                detail: 'Google-Extended restricted on /docs/ since 29 Oct',
                status: 'done',
                time: '0.6s',
              },
            ]}
          />
          <div className="cl-screen-reply">
            <p>
              Gemini named you in 36 of 120 answers, down from 43. It cited{' '}
              <strong>acme.com/docs/setup</strong> in 9 answers last week and 2 this week, and now
              cites northwind.io/docs.
            </p>
            <p>
              On 29 Oct your robots.txt started disallowing Google-Extended on /docs/, the only
              change to those pages. Remove that rule and re-run the 9 prompts.
            </p>
            <div className="cl-screen-chips">
              <Citation index={1} domain="acme.com" title="/docs/setup" own />
              <Citation index={2} domain="northwind.io" title="/docs" />
            </div>
            <ScreenMeta>09:14</ScreenMeta>
          </div>
        </div>
        <div className="cl-screen-composer">
          <span className="cl-screen-muted">Ask a question or describe the work you need.</span>
          <div className="cl-screen-composer-bar">
            <Badge>Haiku</Badge>
            <Badge>Medium effort</Badge>
            <ScreenButton variant="primary" icon={ArrowUp} label="Send" />
          </div>
        </div>
      </div>
      <ScreenCard
        eyebrow="Action added · 09:14"
        title="Let Gemini read /docs/ again"
        action={<Badge>Open</Badge>}
      >
        <div className="cl-screen-detail">
          <FactList
            layout="ruled"
            facts={[
              { label: 'Priority', value: 'High' },
              { label: 'Source', value: 'Site Health' },
            ]}
          />
          <ScreenSection label="Measure with">
            <p className="cl-screen-body">
              Prompt score rises on Gemini for the 9 prompts that cited /docs/setup.
            </p>
          </ScreenSection>
          <div className="cl-screen-actions">
            <ScreenButton variant="primary">Work on this</ScreenButton>
          </div>
        </div>
      </ScreenCard>
    </ScreenRoot>
  );
}

const BRIEF_CONTENTS = [
  'Introduction',
  'What answers cite now',
  'Outline',
  'Facts to include',
  'Measure with',
] as const;

/** A content brief the Agent drafted, with its contents beside it. */
export function ScreenAgentBrief() {
  return (
    <ScreenRoot name="agent-brief" width={960} height={600}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[
              { label: 'Document' },
              { label: 'Sources', count: 6 },
              { label: 'History', count: 3 },
            ]}
            selected="Document"
          />
        }
        end={
          <>
            <ScreenButton variant="ghost" icon={Copy}>
              Copy
            </ScreenButton>
            <ScreenButton icon={Download}>Export</ScreenButton>
          </>
        }
      />
      <ScreenCols layout="brief">
        <div className="cl-screen-toc">
          <span className="type-eyebrow">Contents</span>
          <ul>
            {BRIEF_CONTENTS.map((item, index) => (
              <li key={item} className={cn(index === 0 && 'is-active')}>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ScreenCard
          eyebrow="Content brief · drafted by the Agent, 2 Nov 2026"
          title="Session replay pricing page"
        >
          <div className="cl-screen-prose">
            <p className="cl-screen-prose-heading">Introduction</p>
            <p>
              Acme Analytics is named in 1 of 4 answers to “Cheapest analytics with session replay”.
              Answers quote prices, and acme.com/pricing shows session replay only as an add-on with
              no price in the HTML.
            </p>
            <p className="cl-screen-prose-heading">What answers cite now</p>
            <div className="cl-screen-chips">
              <Citation index={1} domain="northwind.io" title="/pricing" />
              <Citation index={2} domain="g2.com" title="/compare/session-replay" />
              <Citation index={3} domain="reddit.com" title="/r/startups" />
            </div>
            <p className="cl-screen-prose-heading">Outline</p>
            <ol>
              <li>What session replay costs on each Acme plan</li>
              <li>How the Startup plan compares with Northwind and Lumen</li>
              <li>Limits: recordings per month and retention</li>
            </ol>
          </div>
        </ScreenCard>
      </ScreenCols>
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
