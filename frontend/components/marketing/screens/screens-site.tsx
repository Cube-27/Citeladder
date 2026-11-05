import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Callout } from '@/components/ui/callout';
import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { FactList } from '@/components/ui/facts';
import { Meter } from '@/components/ui/meter';
import { ScoreRing } from '@/components/ui/score-ring';
import { SettingsSection, SettingsSections } from '@/components/ui/settings-section';

import {
  BOTS,
  FAILED_CHECKS,
  MCP_ARGS,
  MCP_RESULT,
  MCP_TOOLS,
  POLICY_TONE,
  ROBOTS_TXT,
  SEVERITY_TONE,
} from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCode,
  ScreenCols,
  ScreenMeta,
  ScreenRoot,
  ScreenStack,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
} from './screen-parts';

/** Site Health: the score, its two halves, and the failed checks worst first. */
export function ScreenSiteHealth() {
  return (
    <ScreenRoot name="site-health" width={960}>
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
            columns={[
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
            ]}
          />
        </ScreenTableCard>
      </ScreenCols>
    </ScreenRoot>
  );
}

/** Crawler access: each AI crawler against robots.txt, with the change that restricted two of them. */
export function ScreenCrawlerAccess() {
  return (
    <ScreenRoot name="crawler-access" width={960}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[
              { label: 'All purposes' },
              { label: 'AI training' },
              { label: 'AI search' },
              { label: 'AI user fetch' },
            ]}
            selected="All purposes"
          />
        }
        end={<ScreenMeta>robots.txt fetched today, 06:00 UTC</ScreenMeta>}
      />
      <ScreenCols layout="main-aside">
        <ScreenTableCard title="AI crawlers" meta="2 of 8 AI crawlers are restricted on /docs/">
          <ScreenTable
            caption="AI crawler access from robots.txt"
            rows={BOTS}
            rowKey={(row) => row.bot}
            columns={[
              {
                header: 'Bot',
                width: 'lg',
                cell: (row) => <span className="cl-screen-mono cl-screen-strong">{row.bot}</span>,
              },
              { header: 'Operator', width: 'md', cell: (row) => row.operator },
              {
                header: 'Purpose',
                cell: (row) => <span className="cl-screen-muted">{row.purpose}</span>,
              },
              {
                header: 'Robots policy',
                width: 'lg',
                cell: (row) => (
                  <Badge tone={POLICY_TONE[row.policy]} dot>
                    {row.policy}
                  </Badge>
                ),
              },
            ]}
          />
        </ScreenTableCard>
        <ScreenStack>
          <Callout tone="warning" title="Changed on 29 Oct">
            GPTBot and Google-Extended can no longer read /docs/. 14 pages are affected.
          </Callout>
          <ScreenCode filename="acme.com/robots.txt" code={ROBOTS_TXT} />
        </ScreenStack>
      </ScreenCols>
    </ScreenRoot>
  );
}

function IntegrationRow({
  engine,
  name,
  detail,
  status,
  action,
}: Readonly<{
  engine?: EngineKey;
  name: string;
  detail: string;
  status: ReactNode;
  action: 'Manage' | 'Connect';
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
      <ScreenButton variant={action === 'Connect' ? 'primary' : 'secondary'}>{action}</ScreenButton>
    </div>
  );
}

const connected = (
  <Badge tone="positive" dot>
    Connected
  </Badge>
);

/** Integrations: the data sources CiteLadder reads and the assistants that read it over MCP. */
export function ScreenIntegrations() {
  return (
    <ScreenRoot name="integrations" width={960}>
      <SettingsSections>
        <SettingsSection
          title="Data sources"
          description="Accounts CiteLadder reads for acme.com. Nothing is written back."
        >
          <div className="cl-screen-rows">
            <IntegrationRow
              engine="google"
              name="Google Search Console"
              detail="sc-domain:acme.com · synced today, 05:40 UTC"
              status={connected}
              action="Manage"
            />
            <IntegrationRow
              engine="google"
              name="Google Analytics 4"
              detail="Acme Analytics – web · synced today, 05:40 UTC"
              status={connected}
              action="Manage"
            />
            <IntegrationRow
              name="Cloudflare Logpush"
              detail="AI crawler requests · complete for 28 days"
              status={connected}
              action="Manage"
            />
            <IntegrationRow
              name="Bing Webmaster Tools"
              detail="Clicks and impressions from Bing, counted separately"
              status={<Badge>Optional</Badge>}
              action="Connect"
            />
          </div>
        </SettingsSection>
        <SettingsSection
          title="AI assistants"
          description="Use your CiteLadder data from an assistant over MCP."
        >
          <div className="cl-screen-rows">
            <IntegrationRow
              engine="claude"
              name="Claude"
              detail="Last tool call today, 09:12 UTC"
              status={connected}
              action="Manage"
            />
            <IntegrationRow
              engine="chatgpt"
              name="ChatGPT"
              detail="Add CiteLadder as a connector"
              status={<Badge>Not connected</Badge>}
              action="Connect"
            />
          </div>
        </SettingsSection>
      </SettingsSections>
    </ScreenRoot>
  );
}

/** MCP: the tools an assistant sees and one call with its arguments and result. */
export function ScreenMcp() {
  return (
    <ScreenRoot name="mcp" width={960}>
      <ScreenCols layout="mcp">
        <ScreenTableCard
          eyebrow="MCP server"
          title="citeladder"
          action={
            <Badge tone="positive" dot>
              Connected
            </Badge>
          }
          meta="42 tools · writes need your confirmation"
        >
          <ScreenTable
            caption="Tools the CiteLadder MCP server exposes"
            rows={MCP_TOOLS}
            rowKey={(row) => row.tool}
            columns={[
              { header: 'Tool', cell: (row) => <span className="cl-screen-mono">{row.tool}</span> },
              {
                header: 'Access',
                width: 'sm',
                cell: (row) => (
                  <Badge tone={row.access === 'Write' ? 'warning' : 'neutral'}>{row.access}</Badge>
                ),
              },
            ]}
          />
        </ScreenTableCard>
        <ScreenCard
          eyebrow="Tool call"
          title="read_visibility_overview"
          action={
            <Badge tone="positive" dot>
              Completed in 0.4s
            </Badge>
          }
        >
          <div className="cl-screen-detail">
            <ScreenCode filename="Arguments" code={MCP_ARGS} />
            <ScreenCode filename="Result" code={MCP_RESULT} />
          </div>
        </ScreenCard>
      </ScreenCols>
    </ScreenRoot>
  );
}
