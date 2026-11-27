import type { ReactNode } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import { SignalInsight } from '@/components/demand/demand-signal-insight';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Absence } from '@/components/ui/absence';
import type { DemandDetectorPolicy } from '@citeladder/contracts';
import { ArrowUpRight, ShieldCheck, Split } from '@/lib/icons';
import type { DemandSignal } from '@/lib/api/demand';
import {
  competingPages,
  demandSignalHandoffHref,
  numericMetric,
  signalTarget,
} from '@/lib/demand/signals';
import { DisplayTime } from '@/components/ui/display-time';
import { formatCount, formatPercent } from '@/lib/format';
import { Text } from '@/components/ui/typography';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { UrlText } from '@/components/ui/table';
import { Section, SectionBleed, SectionHeader, SectionTitle } from '@/components/ui/section';

export function DemandEvidenceDrawer({
  signal,
  policy,
  open,
  onOpenChange,
}: Readonly<{
  signal: DemandSignal | null;
  policy: DemandDetectorPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  if (!signal) return null;
  const details = demandEvidenceDetails(signal);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Signal evidence"
      title={details.target}
      footer={
        <Inline wrap justify="between">
          {signal.action_id ? (
            <ActionButton
              action="openAction"
              href={`/actions/${signal.action_id}`}
              aria-label={`Open the Action for ${details.target}`}
            />
          ) : null}
          <Button variant="secondary" asChild>
            <ProjectLink
              href={demandSignalHandoffHref(signal)}
              className="inline-flex items-center"
            >
              <Icon icon={ArrowUpRight} />
              Ask agent
            </ProjectLink>
          </Button>
        </Inline>
      }
    >
      <SignalInsight signal={signal} policy={policy} />

      {details.pages.length > 0 && (
        <Section>
          <SectionHeader>
            <SectionTitle level={3}>
              <Inline as="span">
                <Icon icon={Split} tone="ink-2" />
                Competing pages ({details.pages.length})
              </Inline>
            </SectionTitle>
          </SectionHeader>
          <SectionBleed rows>
            {details.pages.map((page) => (
              <Stack key={page.url} gap="tight">
                <Text as="div" variant="caption-strong" tone="ink" box="row">
                  <UrlText url={page.url} />
                </Text>
                <Inline gap="none" justify="between">
                  <Text variant="caption">{formatCount(page.impressions)} impressions</Text>
                  <Text variant="caption-strong" tone="ink" numeric>
                    {formatPercent(page.share)} query share
                  </Text>
                </Inline>
              </Stack>
            ))}
          </SectionBleed>
        </Section>
      )}

      {details.cohortMedianCtr !== null && (
        <Section>
          <SectionHeader>
            <SectionTitle level={3}>Position benchmark</SectionTitle>
          </SectionHeader>
          <SectionBleed rows>
            <Inline gap="none" align="stretch" justify="between">
              <Text variant="caption">Position band</Text>
              {details.positionBand !== null ? (
                <Text variant="caption-strong" tone="ink">
                  Positions {details.positionBand}.0 – {details.positionBand}.9
                </Text>
              ) : (
                <Text variant="caption">
                  <Absence state="not_measured" />
                </Text>
              )}
            </Inline>
            <Inline gap="none" align="stretch" justify="between">
              <Text variant="caption">Median CTR in this band</Text>
              <Text variant="caption-strong" numeric>
                {formatPercent(details.cohortMedianCtr)}
              </Text>
            </Inline>
          </SectionBleed>
        </Section>
      )}

      <Section aria-labelledby="demand-provenance">
        <SectionHeader>
          <SectionTitle level={3} id="demand-provenance">
            <Inline as="span">
              <Icon icon={ShieldCheck} tone="ink-2" />
              Provenance
            </Inline>
          </SectionTitle>
        </SectionHeader>
        <SectionBleed as="dl" rows>
          <ProvenanceRow label="Search Console rows">
            <ProvenanceCount value={details.metricRowCount} />
          </ProvenanceRow>
          <ProvenanceRow label="Source imports">
            <ProvenanceCount value={details.artifactCount} />
          </ProvenanceRow>
          <ProvenanceRow label="Evaluated">
            <DisplayTime value={signal.created_at} dateOnly />
          </ProvenanceRow>
        </SectionBleed>
      </Section>
    </Drawer>
  );
}

function ProvenanceRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Inline gap="workspace" justify="between">
      <Text as="dt" variant="caption">
        {label}
      </Text>
      <Text as="dd" variant="caption" tone="ink" numeric>
        {children}
      </Text>
    </Inline>
  );
}

function demandEvidenceDetails(signal: DemandSignal) {
  const evidence = signal.evidence;
  const rawBand = evidence.position_band;
  return {
    target: signalTarget(signal),
    pages: competingPages(signal),
    cohortMedianCtr: numericMetric(signal, 'cohort_median_ctr'),
    positionBand:
      typeof rawBand === 'number' && Number.isFinite(rawBand) ? Math.floor(rawBand) : null,
    metricRowCount: sourceCount(evidence.source_metric_row_ids),
    artifactCount: sourceCount(evidence.source_artifact_ids),
  };
}

function sourceCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function ProvenanceCount({ value }: Readonly<{ value: number | null }>) {
  return value === null ? <Absence state="not_measured" /> : formatCount(value);
}
