'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Download, ExternalLink, LoaderCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { DashboardSection } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === 'boolean') return value ? 'Configured' : 'Not configured';
  if (typeof value === 'string') return value.replaceAll('_', ' ');
  return 'Available';
}

function sectionSummary(section: DashboardSection): string | null {
  const entries = Object.entries(section.metrics).filter(([, value]) => value !== null);
  if (entries.length === 0) return null;
  const [name, value] = entries[0];
  return `${name.replaceAll('_', ' ')}: ${displayValue(value)}`;
}

function hasDashboardSignal(section: DashboardSection) {
  return (
    section.state === 'ready' || section.state === 'running' || sectionSummary(section) !== null
  );
}

function SectionCard({ section }: Readonly<{ section: DashboardSection }>) {
  return (
    <Link
      href={section.href}
      data-tour={`dashboard-${section.id}`}
      className="focus-ring block rounded-md"
      aria-label={`Open ${section.title}`}
    >
      <Card className="hover:bg-background-alt h-full transition-colors">
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{section.title}</CardTitle>
            <ExternalLink className="text-muted size-4 shrink-0" aria-hidden />
          </div>
          <CardDescription className="capitalize">
            {section.state.replaceAll('_', ' ')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {sectionSummary(section) ? (
            <p className="text-secondary text-sm capitalize">{sectionSummary(section)}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: unknown }>) {
  return (
    <div className="border-border-subtle border-s ps-3 first:border-s-0 first:ps-0">
      <p className="text-subtle text-xs">{label}</p>
      <p className="text-foreground mono mt-1 text-lg">{displayValue(value)}</p>
    </div>
  );
}

/** Active-project landing view backed exclusively by the persisted Dashboard projection. */
export function DashboardScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const dashboard = useQuery({
    queryKey: queryKeys.projects.dashboard(activeProject?.id ?? ''),
    queryFn: ({ signal }) => projectsApi.getDashboard(activeProject!.id, { signal }),
    enabled: Boolean(activeProject),
  });

  const downloadReport = async () => {
    if (!activeProject) return;
    setDownloadError(false);
    setDownloading(true);
    try {
      const blob = await projectsApi.downloadDashboardReport(activeProject.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `searchify-${activeProject.brand_name || activeProject.name}-report.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (!activeProject) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <CardTitle>Start with a project</CardTitle>
          <CardDescription>Create a brand to activate your Dashboard.</CardDescription>
          <Button asChild className="w-fit">
            <Link href="/onboarding?new=1">
              <Plus className="size-4" aria-hidden />
              Add project
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (dashboard.isLoading) return <Skeleton className="h-72 w-full" />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <Alert tone="danger">
        Could not load the Dashboard.{' '}
        <Button variant="ghost" size="sm" onClick={() => dashboard.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }

  const { data } = dashboard;
  const visibility = data.analyze.find((section) => section.id === 'visibility');
  const analyzeSections = data.analyze.filter(
    (section) =>
      !(section.id === 'visibility' && section.state === 'empty') && hasDashboardSignal(section),
  );
  const improveSections = data.improve.filter(
    (section) => section.id !== 'projects' && hasDashboardSignal(section),
  );
  return (
    <div className="grid gap-6" data-tour="dashboard-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground text-xl">
            {data.project.brand_name || data.project.name}
          </h2>
          <p className="text-muted mt-1 text-sm">
            A live summary of your persisted Searchify results.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={downloadReport}
          disabled={downloading}
          data-tour="dashboard-report"
        >
          {downloading ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {downloading ? 'Preparing…' : 'Download report'}
        </Button>
      </div>

      {downloadError ? (
        <Alert tone="danger">Could not download the report. Please try again.</Alert>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Visibility score" value={data.executive_metrics.visibility_score} />
          <Metric label="Site health" value={data.executive_metrics.site_health_score} />
          <Metric label="Open opportunities" value={data.executive_metrics.open_opportunities} />
          <Metric label="Active prompts" value={data.executive_metrics.active_prompts} />
        </CardContent>
      </Card>

      {visibility?.state === 'empty' ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid gap-1">
              <h2 className="text-foreground text-heading-sm">Start measuring visibility</h2>
              <p className="text-secondary text-sm">
                Connect an answer-engine provider, then launch your first audit to populate this
                dashboard.
              </p>
            </div>
            <Button asChild variant="secondary" className="shrink-0">
              <Link href="/settings?tab=providers">
                Connect providers
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data.active_work.length > 0 ? (
        <Alert tone="info">
          Active work: {data.active_work.map((item) => item.replaceAll('_', ' ')).join(', ')}.
        </Alert>
      ) : null}

      {analyzeSections.length > 0 ? (
        <section aria-labelledby="dashboard-analyze">
          <h2 id="dashboard-analyze" className="text-foreground text-heading-sm mb-3">
            Analyze
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {analyzeSections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        </section>
      ) : null}

      {improveSections.length > 0 ? (
        <section aria-labelledby="dashboard-improve">
          <h2 id="dashboard-improve" className="text-foreground text-heading-sm mb-3">
            Improve
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {improveSections.map((section) => (
              <SectionCard key={section.id} section={section} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
