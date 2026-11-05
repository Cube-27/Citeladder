import type { ReactNode } from 'react';
import { Info, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { ScoreRing } from '@/components/ui/score-ring';
import { ICONS } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { BOTS, FAILED_CHECKS, MCP_RESULT, POLICY_TONE, type Severity } from './demo-data';
import { ScreenCard, ScreenCode, ScreenMeta, ScreenRoot } from './screen-parts';

/** The checks the vignette lists: the worst three of the failed ones. */
const WORST_CHECKS = FAILED_CHECKS.slice(0, 3);

/** A failed check's severity as the app's notice icons draw it: danger, warning, or muted info. */
const SEVERITY_ICON: Readonly<Record<Severity, Readonly<{ icon: LucideIcon; tone: string }>>> = {
  High: { icon: ICONS.danger, tone: 'text-negative' },
  Medium: { icon: ICONS.warning, tone: 'text-warning' },
  Low: { icon: Info, tone: 'text-ink-muted' },
};

function SeverityIcon({ severity }: Readonly<{ severity: Severity }>) {
  const { icon: Icon, tone } = SEVERITY_ICON[severity];
  return <Icon className={cn('size-5 shrink-0', tone)} aria-hidden />;
}

/**
 * Site Health, as a card vignette: the score ring beside the failed-check
 * count, then the three worst failed checks, each with its severity dot and
 * the pages it affects. Large type, so it still reads scaled down in a tile.
 */
export function ScreenSiteHealth() {
  return (
    <ScreenRoot name="site-health" width={480} height={400}>
      <Card className="cl-vignette">
        <div className="cl-vignette-score">
          <ScoreRing value={82} tone="auto" label="Site Health score" />
          <div className="cl-vignette-head">
            <p className="cl-vignette-title">Site Health</p>
            <p className="cl-vignette-sub">{`${FAILED_CHECKS.length} failed checks on acme.com`}</p>
          </div>
        </div>
        <ul className="cl-vignette-list cl-vignette-list--spaced" aria-label="Worst failed checks">
          {WORST_CHECKS.map((row) => (
            <li key={row.check} className="cl-vignette-line">
              <span className="cl-vignette-check">
                <SeverityIcon severity={row.severity} />
                <span>{row.check}</span>
                <span className="sr-only">{`${row.severity} severity`}</span>
              </span>
              <span className="cl-vignette-figure">{`${row.pages} pages`}</span>
            </li>
          ))}
        </ul>
        <p className="cl-vignette-sub cl-vignette-foot">
          {`${FAILED_CHECKS.length - WORST_CHECKS.length} more failed checks`}
        </p>
      </Card>
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
