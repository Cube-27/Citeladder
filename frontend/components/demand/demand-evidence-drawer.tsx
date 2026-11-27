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
import { textRole } from '@/components/ui/text-role';
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
        <Inline className="flex-wrap justify-between">
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
                <Icon icon={Split} className="text-ink-2" />
                Competing pages ({details.pages.length})
              </Inline>
            </SectionTitle>
          </SectionHeader>
          <SectionBleed rows>
            {details.pages.map((page) => (
              <Stack key={page.url} gap="tight" className="text-caption text-ink-2">
                <div className={textRole('emphasis', 'text-ink flex min-w-0')}>
                  <UrlText url={page.url} />
                </div>
                <div className="text-caption text-ink-2 flex items-center justify-between">
                  <span>{formatCount(page.impressions)} impressions</span>
                  <span className={textRole('emphasis', 'text-ink tabular-nums')}>
                    {formatPercent(page.share)} query share
                  </span>
                </div>
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
            <div className="text-caption text-ink-2 flex justify-between">
              <span className="text-ink-2">Position band</span>
              {details.positionBand !== null ? (
                <span className={textRole('emphasis', 'text-ink')}>
                  Positions {details.positionBand}.0 – {details.positionBand}.9
                </span>
              ) : (
                <Absence state="not_measured" />
              )}
            </div>
            <div className="text-caption text-ink-2 flex justify-between">
              <span className="text-ink-2">Median CTR in this band</span>
              <span className={textRole('emphasis', 'text-ink-2 tabular-nums')}>
                {formatPercent(details.cohortMedianCtr)}
              </span>
            </div>
          </SectionBleed>
        </Section>
      )}

      <Section aria-labelledby="demand-provenance">
        <SectionHeader>
          <SectionTitle level={3} id="demand-provenance">
            <Inline as="span">
              <Icon icon={ShieldCheck} className="text-ink-2" />
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
    <Inline gap="workspace" className="text-caption text-ink-2 justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink tabular-nums">{children}</dd>
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
