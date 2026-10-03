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
import { readSiteFacts, type SiteFactsView } from '@/lib/site-health/site-facts';
import { RobotsHistory } from './robots-history';

const purposeLabels: Record<SiteFactsView['robots']['bots'][number]['purpose'], string> = {
  ai_training: 'AI training',
  ai_search: 'AI search',
  ai_user_fetch: 'AI user fetch',
  search_engine: 'Search engine',
  other: 'Other',
};
const policyLabels = {
  all_allowed: 'All allowed',
  restricted: 'Restricted',
  all_disallowed: 'All disallowed',
  unknown: 'Unknown',
} as const;

export function SiteFactsPanel({
  crawl,
  dashboard,
}: Readonly<{
  crawl: SiteCrawl | null;
  dashboard: SiteHealthDashboard | undefined;
}>) {
  const current = dashboard?.crawl ?? crawl;
  const view = readSiteFacts(current?.site_facts);
  if (!current || !view) return null;
  return <SiteFactsViewPanel key={current.id} crawl={current} view={view} />;
}
function SiteFactsViewPanel({ crawl, view }: Readonly<{ crawl: SiteCrawl; view: SiteFactsView }>) {
  const [purpose, setPurpose] = useState('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const purposes = [...new Set(view.robots.bots.map((bot) => bot.purpose))];
  const unknown = view.robots.status === 'fetch_failed' || view.robots.status === 'access_blocked';
  return (
    <Card className="min-w-0">
      <CardContent className="grid min-w-0 gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>AI crawler robots policy</SectionTitle>
          <Button variant="secondary" size="sm" asChild>
            <ProjectLink
              projectId={crawl.project_id}
              href={agentHandoffHref({
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
          robots.txt: {view.robots.status.replaceAll('_', ' ')}
          {view.robots.status_code !== null ? ` (HTTP ${view.robots.status_code})` : ''} · llms.txt:{' '}
          {view.llms_txt.fetched ? (view.llms_txt.present ? 'present' : 'absent') : 'not fetched'}
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
            ...purposes.map((value) => ({ value, label: purposeLabels[value] })),
          ]}
        />
        {purposes
          .filter((value) => purpose === 'all' || value === purpose)
          .map((group) => (
            <div key={group} className="min-w-0">
              <h3 className={textRole('itemTitle', 'mb-2')}>{purposeLabels[group]}</h3>
              <Table>
                <caption className="sr-only">{purposeLabels[group]} robots policy</caption>
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
                        <TableCell>
                          {bot.matched === 'no_rules'
                            ? 'Not specified'
                            : bot.matched === 'specific_group'
                              ? 'Specific group'
                              : 'Wildcard group'}
                        </TableCell>
                        <TableCell>
                          <Badge>
                            {bot.root_access === 'allowed'
                              ? 'Allowed'
                              : bot.root_access === 'disallowed'
                                ? 'Disallowed'
                                : 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge>{policyLabels[bot.policy]}</Badge>
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
            <RobotsHistory
              workspaceId={crawl.workspace_id}
              projectId={crawl.project_id}
              crawlId={crawl.id}
            />
          ) : null}
        </Disclosure>
      </CardContent>
    </Card>
  );
}
