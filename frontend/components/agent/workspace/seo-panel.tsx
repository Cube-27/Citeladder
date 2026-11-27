import { StatusMark } from '@/components/ui/status-mark';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline } from '@/components/ui/layout';
import {
  Section,
  SectionBleed,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { Text } from '@/components/ui/typography';
import type { AgentPageFetchDone } from '@/lib/api/agent';
import { pluralCount } from '@/lib/format';
import { severityLabel } from '@/lib/site-health/issues';
import { issueSeveritySchema } from '@citeladder/contracts';

type PageCheck = AgentPageFetchDone['checks'][number];

function CheckRow({ check }: Readonly<{ check: PageCheck }>) {
  const severity = issueSeveritySchema.safeParse(check.severity);
  return (
    <Inline as="li" gap="compact" justify="between">
      <Text variant="body">{check.label}</Text>
      {severity.success ? (
        <StatusMark variant="severity" value={severity.data}>
          {severityLabel(severity.data)}
        </StatusMark>
      ) : null}
    </Inline>
  );
}

export function SeoPanel({ fetch }: Readonly<{ fetch: AgentPageFetchDone | null }>) {
  const failing = fetch?.checks.filter((check) => check.failing) ?? [];
  const passed = fetch?.checks.filter((check) => check.outcome === 'satisfied').length ?? 0;
  return (
    <Section aria-labelledby="seo-checks">
      <SectionHeader>
        <SectionTitle id="seo-checks" level={3}>
          Page checks
        </SectionTitle>
        <SectionDescription>
          {fetch?.fetched_at ? (
            <>
              Fetched <DisplayTime value={fetch.fetched_at} />.{' '}
            </>
          ) : null}
          Editing the page doesn’t rerun them.
        </SectionDescription>
      </SectionHeader>
      {failing.length > 0 ? (
        <SectionBleed as="ul" rows aria-label="Checks to fix">
          {failing.map((check) => (
            <CheckRow key={check.rule_id} check={check} />
          ))}
        </SectionBleed>
      ) : (
        <Text as="p" variant="body" tone="ink-2">
          {fetch?.checks.length ? 'Every page check passed.' : 'No page checks ran on this fetch.'}
        </Text>
      )}
      {failing.length > 0 && passed > 0 ? (
        <Text as="p" variant="caption">
          {pluralCount(passed, 'other check')} passed.
        </Text>
      ) : null}
    </Section>
  );
}
