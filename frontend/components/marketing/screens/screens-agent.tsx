import { ArrowUp, Copy, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { Citation } from '@/components/ui/citation';
import { FactList } from '@/components/ui/facts';
import { SearchField } from '@/components/ui/search-field';
import { StepList } from '@/components/ui/step-list';
import { cn } from '@/lib/utils';

import { ACTION_STATUS_TONE, ACTIONS, CATALOG, SHELF, type ActionStatus } from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCols,
  ScreenMeta,
  ScreenNotedStat,
  ScreenRoot,
  ScreenSection,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
} from './screen-parts';

const still = () => undefined;

const quoted = (kind: string) => kind === 'Prompt' || kind === 'Search query';

function StatusBadge({ status }: Readonly<{ status: ActionStatus }>) {
  return (
    <Badge tone={ACTION_STATUS_TONE[status]} dot={status !== 'Open' && status !== 'Dismissed'}>
      {status}
    </Badge>
  );
}

/** Actions: prioritised work with its linked evidence, one action open beside the list. */
export function ScreenActions() {
  return (
    <ScreenRoot name="actions" width={1200}>
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
            columns={[
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
            ]}
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
    <ScreenRoot name="agent-chat" width={960}>
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
    <ScreenRoot name="agent-brief" width={960}>
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

function Shelf() {
  return (
    <div className="cl-screen-detail">
      <div className="cl-screen-shelf-head">
        <span className="cl-screen-heading">Acme Startup</span>
        <Badge>Product</Badge>
        <ScreenMeta>48 answers · 2 Nov 2026</ScreenMeta>
      </div>
      <div className="cl-screen-pstats">
        <ScreenNotedStat
          label="Product visibility"
          value="41.7"
          unit="%"
          note="Share of answers that recommended you"
        />
        <ScreenNotedStat
          label="Share of shelf"
          value="24.0"
          unit="%"
          note="37 of 154 recommendations"
        />
        <ScreenNotedStat
          label="Average position"
          value="2.3"
          note="In answers that ranked products"
        />
        <ScreenNotedStat
          label="First-position rate"
          value="18.8"
          unit="%"
          note="9 of 48 ranked answers"
        />
      </div>
      <ScreenSection label="Who held the shelf">
        <ol className="cl-screen-rank">
          {SHELF.map((entry) => (
            <li key={entry.product} className="cl-screen-rank-row cl-screen-rank-row--tall">
              <BrandMark name={entry.brand} />
              <span className="cl-screen-lines">
                <span className="cl-screen-strong">{entry.product}</span>
                <span className="cl-screen-muted">
                  {`${entry.brand} · ${entry.domain} · In ${entry.answers} of 48 answers · best #${entry.best}`}
                </span>
              </span>
              <Badge tone={entry.own ? 'accent' : 'neutral'}>
                {entry.own ? 'You' : 'Competitor'}
              </Badge>
            </li>
          ))}
        </ol>
      </ScreenSection>
    </div>
  );
}

/** Commerce: the product catalogue beside who held the AI shelf for one product. */
export function ScreenCommerce() {
  return (
    <ScreenRoot name="commerce" width={960}>
      <ScreenBar
        start={
          <div className="cl-screen-search">
            <SearchField
              value=""
              onValueChange={still}
              placeholder="Search categories and products"
              aria-label="Search categories and products"
            />
          </div>
        }
        end={<ScreenMeta>5 products · 2 categories</ScreenMeta>}
      />
      <Card>
        <div className="cl-screen-ld">
          <ul className="cl-screen-ld-list">
            {CATALOG.map((item) => (
              <li
                key={item.title}
                className={cn('cl-screen-ld-row', item.title === 'Acme Startup' && 'is-selected')}
              >
                <BrandMark name="Acme Analytics" />
                <span className="cl-screen-lines">
                  <span className="cl-screen-strong">{item.title}</span>
                  <span className="cl-screen-muted">{item.group}</span>
                </span>
              </li>
            ))}
          </ul>
          <Shelf />
        </div>
      </Card>
    </ScreenRoot>
  );
}
