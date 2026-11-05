import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { FactList } from '@/components/ui/facts';
import { Meter } from '@/components/ui/meter';
import { ScoreRing } from '@/components/ui/score-ring';

import { BOTS, FAILED_CHECKS, MCP_RESULT, POLICY_TONE, SEVERITY_TONE } from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCode,
  ScreenCols,
  ScreenMeta,
  ScreenRoot,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';

const CHECK_COLUMNS: readonly ScreenColumn<(typeof FAILED_CHECKS)[number]>[] = [
  {
    header: 'Check',
    cell: (row) => <span className="cl-screen-strong">{row.check}</span>,
  },
  {
    header: 'Severity',
    width: 'md',
    cell: (row) => (
      <Badge tone={SEVERITY_TONE[row.severity]} dot>
        {row.severity}
      </Badge>
    ),
  },
  { header: 'Pages', width: 'sm', numeric: true, cell: (row) => `${row.pages} pages` },
];

/** Site Health: the score, its two halves, and the failed checks worst first. */
export function ScreenSiteHealth() {
  return (
    <ScreenRoot name="site-health" width={960} height={600}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[
              { label: 'Overview' },
              { label: 'Pages' },
              { label: 'AEO Readiness' },
              { label: 'Internal links' },
              { label: 'Changes' },
            ]}
            selected="Overview"
          />
        }
        end={<ScreenButton icon={RefreshCw}>Run new crawl</ScreenButton>}
      />
      <ScreenCols layout="aside-main">
        <ScreenCard
          title="Site Health"
          action={
            <Badge tone="positive" dot>
              Good
            </Badge>
          }
        >
          <div className="cl-screen-detail">
            <div className="cl-screen-score">
              <ScoreRing value={82} tone="auto" label="Site Health score" />
              <div className="cl-screen-lines">
                <span className="cl-screen-strong">7 failed checks</span>
                <span className="cl-screen-muted">Crawled today, 05:12</span>
              </div>
            </div>
            <div className="cl-screen-meters cl-screen-meters--stack">
              <Meter label="Web Fundamentals" value={86} valueLabel="86" />
              <Meter label="AEO Readiness" value={78} valueLabel="78" />
            </div>
            <FactList
              layout="spread"
              facts={[
                { label: 'Pages analyzed', value: '214 of 231' },
                { label: 'Blocked by robots.txt', value: '14' },
              ]}
            />
          </div>
        </ScreenCard>
        <ScreenTableCard
          title="Failed checks"
          action={<ScreenMeta>Worst first</ScreenMeta>}
          meta="7 checks failed on the last crawl. Advisories are listed separately."
        >
          <ScreenTable
            caption="Failed Site Health checks"
            rows={FAILED_CHECKS}
            rowKey={(row) => row.check}
            columns={CHECK_COLUMNS}
          />
        </ScreenTableCard>
      </ScreenCols>
    </ScreenRoot>
  );
}

/** The crawlers the vignette lists: both restricted ones among the allowed. */
const LISTED_BOTS = BOTS.filter((row) =>
  ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot'].includes(row.bot),
);

/** Crawler access: AI crawlers against robots.txt, the two restricted ones flagged. */
export function ScreenCrawlerAccess() {
  return (
    <ScreenRoot name="crawler-access" width={480} height={320}>
      <ScreenCard
        title="AI crawlers"
        meta="acme.com/robots.txt · today, 06:00 UTC"
        action={
          <Badge tone="warning" dot>
            2 of 8 restricted
          </Badge>
        }
      >
        <ul className="cl-screen-bots">
          {LISTED_BOTS.map((row) => (
            <li key={row.bot} className="cl-screen-bot">
              <span className="cl-screen-mono cl-screen-strong">{row.bot}</span>
              <span className="cl-screen-muted">{row.purpose}</span>
              <Badge tone={POLICY_TONE[row.policy]} dot>
                {row.policy === 'Restricted' ? 'Disallow /docs/' : row.policy}
              </Badge>
            </li>
          ))}
        </ul>
      </ScreenCard>
    </ScreenRoot>
  );
}

function IntegrationRow({
  engine,
  name,
  detail,
  status,
}: Readonly<{
  engine?: EngineKey;
  name: string;
  detail: string;
  status: ReactNode;
}>) {
  return (
    <div className="cl-screen-int">
      {engine ? (
        <span className="cl-screen-int-mark">
          <EngineMark engine={engine} />
        </span>
      ) : (
        <BrandMark name={name} placement="header" />
      )}
      <span className="cl-screen-lines">
        <span className="cl-screen-strong">{name}</span>
        <span className="cl-screen-muted">{detail}</span>
      </span>
      {status}
    </div>
  );
}

const connected = (
  <Badge tone="positive" dot>
    Connected
  </Badge>
);

/** Integrations: the data sources CiteLadder reads for one site. */
export function ScreenIntegrations() {
  return (
    <ScreenRoot name="integrations" width={480} height={320}>
      <ScreenCard
        title="Data sources"
        meta="acme.com · read only · synced 05:40 UTC"
        action={<ScreenMeta>3 connected</ScreenMeta>}
      >
        <div className="cl-screen-rows">
          <IntegrationRow
            engine="google"
            name="Google Search Console"
            detail="sc-domain:acme.com"
            status={connected}
          />
          <IntegrationRow
            engine="google"
            name="Google Analytics 4"
            detail="Acme Analytics – web"
            status={connected}
          />
          <IntegrationRow
            name="Cloudflare Logpush"
            detail="AI crawler requests"
            status={connected}
          />
          <IntegrationRow
            name="Bing Webmaster Tools"
            detail="Bing clicks and impressions"
            status={<Badge>Optional</Badge>}
          />
        </div>
      </ScreenCard>
    </ScreenRoot>
  );
}

/** MCP: one tool call an assistant made, with its result. */
export function ScreenMcp() {
  return (
    <ScreenRoot name="mcp" width={480} height={320}>
      <ScreenCard
        title="Tool call"
        meta="citeladder MCP · acme.com, this week"
        action={
          <Badge tone="positive" dot>
            Completed in 0.4s
          </Badge>
        }
      >
        <ScreenCode filename="read_visibility_overview" code={MCP_RESULT} />
      </ScreenCard>
    </ScreenRoot>
  );
}
