import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { EngineMark } from '@/components/ui/engine-mark';
import { ICONS, Info, type IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

import {
  BOTS,
  FAILED_CHECKS,
  INTEGRATIONS,
  MCP_CALLS,
  POLICY_TONE,
  type Severity,
} from './demo-data';
import { Vignette, VignetteRows, fourRows } from './screen-vignette';

/** A failed check's severity as the app's notice icons draw it: danger, warning, or muted info. */
const SEVERITY_ICON: Readonly<Record<Severity, Readonly<{ icon: IconGlyph; tone: string }>>> = {
  High: { icon: ICONS.danger, tone: 'text-negative' },
  Medium: { icon: ICONS.warning, tone: 'text-warning' },
  Low: { icon: Info, tone: 'text-ink-muted' },
};

function SeverityIcon({ severity }: Readonly<{ severity: Severity }>) {
  const { icon: Icon, tone } = SEVERITY_ICON[severity];
  return <Icon className={cn('size-5', tone)} aria-hidden />;
}

/** Site Health: the score, then the four worst failed checks with the pages each affects. */
export function ScreenSiteHealth() {
  return (
    <Vignette
      title="Site health"
      meta={`acme.com · ${FAILED_CHECKS.length} failed checks`}
      badge={<Badge tone="positive">Score 82</Badge>}
    >
      <VignetteRows
        label="Worst failed checks"
        rows={fourRows(FAILED_CHECKS, (row) => ({
          key: row.check,
          lead: <SeverityIcon severity={row.severity} />,
          label: row.check,
          secondary: `${row.severity} severity`,
          value: `${row.pages} pages`,
        }))}
      />
    </Vignette>
  );
}

/** The crawlers the vignette lists: both restricted ones among two allowed. */
const LISTED_BOTS = BOTS.filter((row) =>
  ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Google-Extended'].includes(row.bot),
);

/** Crawler access: AI crawlers against robots.txt, the two restricted ones flagged. */
export function ScreenCrawlerAccess() {
  return (
    <Vignette
      title="AI crawlers"
      meta="acme.com/robots.txt · today, 06:00 UTC"
      badge={
        <Badge tone="warning" dot>
          2 of 8 restricted
        </Badge>
      }
    >
      <VignetteRows
        label="AI crawler access"
        rows={fourRows(LISTED_BOTS, (row) => ({
          key: row.bot,
          label: <span className="cl-vig-mono">{row.bot}</span>,
          secondary:
            row.policy === 'Restricted'
              ? `${row.operator} · ${row.purpose} · Disallow /docs/`
              : `${row.operator} · ${row.purpose}`,
          value: (
            <Badge tone={POLICY_TONE[row.policy]} dot>
              {row.policy === 'Restricted' ? 'Restricted' : 'Allowed'}
            </Badge>
          ),
        }))}
      />
    </Vignette>
  );
}

/** Integrations: the data sources CiteLadder reads for one site. */
export function ScreenIntegrations() {
  return (
    <Vignette
      title="Data sources"
      meta="acme.com · read only · synced 05:40 UTC"
      badge={<Badge>3 connected</Badge>}
    >
      <VignetteRows
        label="Data sources"
        rows={fourRows(INTEGRATIONS, (row) => ({
          key: row.name,
          lead: row.google ? <EngineMark engine="google" /> : <BrandMark name={row.name} />,
          label: row.name,
          secondary: row.detail,
          value: row.connected ? (
            <Badge tone="positive" dot>
              Connected
            </Badge>
          ) : (
            <Badge>Optional</Badge>
          ),
        }))}
      />
    </Vignette>
  );
}

/** MCP: the read-only tool calls an assistant made, each with what it returned. */
export function ScreenMcp() {
  return (
    <Vignette
      title="Tool calls"
      meta="citeladder MCP · acme.com, this week"
      badge={<Badge>Read only</Badge>}
    >
      <VignetteRows
        label="Tool calls"
        ordered
        rows={fourRows(MCP_CALLS, (row) => ({
          key: row.tool,
          label: <span className="cl-vig-mono">{row.tool}</span>,
          secondary: row.result,
          value: row.time,
        }))}
      />
    </Vignette>
  );
}
