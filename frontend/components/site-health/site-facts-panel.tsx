'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { ProjectLink } from '@/components/layout/scoped-link';
import type { SiteCrawl, SiteHealthDashboard } from '@/lib/api/types';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { useAgentPanelSeed } from '@/lib/agent/panel-context';
import {
  crawlerMatchedLabels,
  crawlerPolicyLabels,
  crawlerPurposeLabels,
  crawlerRootAccessLabels,
  readSiteFacts,
  robotsStatusLabels,
  type SiteFactsView,
} from '@/lib/site-health/site-facts';
import { RobotsHistory } from './robots-history';

export function SiteFactsPanel({
  crawl,
  dashboard,
}: Readonly<{
  crawl: SiteCrawl | null;
  dashboard: SiteHealthDashboard | undefined;
}>) {
  const current = dashboard?.crawl ?? crawl;
  useAgentPanelSeed(
    current
      ? {
          siteFacts: { crawlId: current.id },
          prompt: 'Explain the selected crawl’s persisted AI crawlability and robots policy.',
        }
      : null,
  );
  const view = readSiteFacts(current?.site_facts);
  if (!current || !view) return null;
  return <SiteFactsViewPanel key={current.id} crawl={current} view={view} />;
}
function SiteFactsViewPanel({ crawl, view }: Readonly<{ crawl: SiteCrawl; view: SiteFactsView }>) {
  const [purpose, setPurpose] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const purposes = [...new Set(view.robots.bots.map((bot) => bot.purpose))];
  const unknown = view.robots.status === 'fetch_failed' || view.robots.status === 'access_blocked';
  let llmsStatus = 'not fetched';
  if (view.llms_txt.fetched) llmsStatus = view.llms_txt.present ? 'present' : 'absent';
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-2">
          <CardTitle>AI crawler robots policy</CardTitle>
          <p className={textRole('caption')}>
            What robots.txt permits over known URLs. This does not prove that a crawler retrieved a
            page.
          </p>
          <p className={textRole('caption')}>
            robots.txt: {robotsStatusLabels[view.robots.status]}
            {view.robots.status_code !== null ? ` (HTTP ${view.robots.status_code})` : ''} ·
            llms.txt: {llmsStatus}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            className="w-48 max-w-full"
            ariaLabel="Filter crawlers by purpose"
            value={purpose}
            onValueChange={setPurpose}
            options={[
              { value: 'all', label: 'All purposes' },
              ...purposes.map((value) => ({ value, label: crawlerPurposeLabels[value] })),
            ]}
          />
          <Button variant="secondary" size="sm" asChild>
            <ProjectLink
              projectId={crawl.project_id}
              href={agentHandoffHref({
                siteFacts: { crawlId: crawl.id },
                prompt: `Explain the persisted AI crawlability and robots policy for crawl ${crawl.id}. Use read_ai_crawlability and distinguish robots permission from observed retrieval.`,
              })}
            >
              Ask agent
            </ProjectLink>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {unknown ? (
          <Alert tone="warning">
            robots.txt could not be read. Root access and robots policy are unknown.
          </Alert>
        ) : null}
        {view.robots.status === 'not_found' ? (
          <Alert tone="info">
            No robots.txt was found. No robots rules restrict these known URLs.
          </Alert>
        ) : null}
        <Table className="min-w-[48rem] table-fixed">
          <caption className="sr-only">Crawler robots policy by purpose</caption>
          <colgroup>
            <col className="w-1/5" />
            <col className="w-[16%]" />
            <col className="w-[22%]" />
            <col className="w-[16%]" />
            <col className="w-[26%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Matched group</TableHead>
              <TableHead>Root access</TableHead>
              <TableHead>Robots policy</TableHead>
            </TableRow>
          </TableHeader>
          {purposes
            .filter((value) => purpose === 'all' || value === purpose)
            .map((group) => (
              <TableBody key={group}>
                <TableRow>
                  <TableHead scope="rowgroup" colSpan={5} className="bg-panel-tonal static">
                    {crawlerPurposeLabels[group]}
                  </TableHead>
                </TableRow>
                {view.robots.bots
                  .filter((bot) => bot.purpose === group)
                  .map((bot) => (
                    <TableRow key={bot.bot_id} density="multiline" className="[&>td]:align-top">
                      <TableCell>{bot.label}</TableCell>
                      <TableCell>{bot.operator}</TableCell>
                      <TableCell>{crawlerMatchedLabels[bot.matched]}</TableCell>
                      <TableCell>
                        <Badge>{crawlerRootAccessLabels[bot.root_access]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="grid justify-items-start gap-1">
                          <Badge>{crawlerPolicyLabels[bot.policy]}</Badge>
                          <p className={textRole('caption')}>
                            {bot.policy === 'unknown'
                              ? 'No complete policy sample is available.'
                              : `${bot.disallowed_url_count} of ${bot.evaluated_url_count} known URLs disallowed`}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            ))}
        </Table>
        <Disclosure title="robots.txt history" onOpenChange={setHistoryOpen}>
          {historyOpen ? (
            <RobotsHistory workspaceId={crawl.workspace_id} projectId={crawl.project_id} />
          ) : null}
        </Disclosure>
      </CardContent>
    </Card>
  );
}
