'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { SectionTitle, textRole } from '@/components/ui/typography';
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
      <CardContent className="grid min-w-0 gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>AI crawler robots policy</SectionTitle>
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
        <p className={textRole('caption')}>
          What robots.txt permits over known URLs. This does not prove that a crawler retrieved a
          page.
        </p>
        <p className={textRole('caption')}>
          robots.txt: {robotsStatusLabels[view.robots.status]}
          {view.robots.status_code !== null ? ` (HTTP ${view.robots.status_code})` : ''} · llms.txt:{' '}
          {llmsStatus}
        </p>
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
        <Select
          ariaLabel="Filter crawlers by purpose"
          value={purpose}
          onValueChange={setPurpose}
          options={[
            { value: 'all', label: 'All purposes' },
            ...purposes.map((value) => ({ value, label: crawlerPurposeLabels[value] })),
          ]}
        />
        {purposes
          .filter((value) => purpose === 'all' || value === purpose)
          .map((group) => (
            <div key={group} className="grid min-w-0 gap-2">
              <h3 className={textRole('itemTitle')}>{crawlerPurposeLabels[group]}</h3>
              <Table>
                <caption className="sr-only">{crawlerPurposeLabels[group]} robots policy</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bot</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Matched group</TableHead>
                    <TableHead>Root access</TableHead>
                    <TableHead>Robots policy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.robots.bots
                    .filter((bot) => bot.purpose === group)
                    .map((bot) => (
                      <TableRow key={bot.bot_id}>
                        <TableCell>{bot.label}</TableCell>
                        <TableCell>{bot.operator}</TableCell>
                        <TableCell>{crawlerMatchedLabels[bot.matched]}</TableCell>
                        <TableCell>
                          <Badge>{crawlerRootAccessLabels[bot.root_access]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge>{crawlerPolicyLabels[bot.policy]}</Badge>
                          <p className={textRole('caption')}>
                            {bot.policy === 'unknown'
                              ? 'No complete policy sample is available.'
                              : `${bot.disallowed_url_count} of ${bot.evaluated_url_count} known URLs disallowed`}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          ))}
        <Disclosure title="robots.txt history" onOpenChange={setHistoryOpen}>
          {historyOpen ? (
            <RobotsHistory workspaceId={crawl.workspace_id} projectId={crawl.project_id} />
          ) : null}
        </Disclosure>
      </CardContent>
    </Card>
  );
}
