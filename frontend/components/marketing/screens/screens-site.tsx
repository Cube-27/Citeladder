import { Badge } from '@/components/ui/badge';
import { EngineMark } from '@/components/ui/engine-mark';
import { ICONS, Info, type IconGlyph } from '@/lib/icons';

import {
  BOTS,
  FAILED_CHECKS,
  INTEGRATIONS,
  MCP_CALLS,
  POLICY_TONE,
  type Severity,
} from './demo-data';
import { Vignette, VignetteRows, fourRows } from './screen-vignette';

const SEVERITY_ICON: Readonly<Record<Severity, IconGlyph>> = {
  High: ICONS.danger,
  Medium: ICONS.warning,
  Low: Info,
};

function SeverityIcon({ severity }: Readonly<{ severity: Severity }>) {
  const Icon = SEVERITY_ICON[severity];
  return <Icon className="size-5" data-severity={severity} aria-hidden />;
}

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

const LISTED_BOTS = BOTS.filter((row) =>
  ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Google-Extended'].includes(row.bot),
);

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
          lead: row.google ? <EngineMark engine="google" /> : undefined,
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
