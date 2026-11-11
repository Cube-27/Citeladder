'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CrawlRobotsChoice } from '@citeladder/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';

/** A page fetched although robots.txt excludes it, because its crawl ignored robots.txt. */
export function RobotsExcludedBadge() {
  return (
    <Tooltip content="robots.txt excludes this page. It was fetched because the crawl ignored robots.txt.">
      <Badge tone="warning">Robots.txt excluded</Badge>
    </Tooltip>
  );
}

/** How a crawl's robots choice reads beside Recrawl and the schedule; null when it respects robots.txt. */
export function robotsChoiceNote(choice: CrawlRobotsChoice | undefined) {
  if (choice?.handling !== 'ignore') return null;
  return choice.decided_by_email
    ? `Ignores robots.txt (confirmed by ${choice.decided_by_email})`
    : 'Ignores robots.txt';
}

/** Recrawl reruns the shown crawl's scope and settings, its robots choice included. */
export function RecrawlButton({
  robots,
  disabled,
  onRecrawl,
}: Readonly<{ robots: CrawlRobotsChoice; disabled: boolean; onRecrawl: () => void }>) {
  const note = robotsChoiceNote(robots);
  const rerun = "Rerun this crawl's scope and settings, so Changes compares like with like.";
  return (
    <Tooltip content={note ? `${rerun} ${note}.` : rerun}>
      <Button variant="secondary" onClick={onRecrawl} disabled={disabled}>
        Recrawl
      </Button>
    </Tooltip>
  );
}

/**
 * Run new crawl, with a second option that ignores robots.txt after the person
 * confirms they are authorized to crawl the site. The server records who
 * confirmed it on the crawl.
 */
export function StartCrawlControl({
  siteUrl,
  primary,
  pending,
  onStart,
}: Readonly<{
  siteUrl: string;
  /** Primary unless the tab has its own primary action. */
  primary: boolean;
  pending: boolean;
  onStart: (robots: 'respect' | 'ignore') => void;
}>) {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const askToIgnore = () =>
    setConfirm({
      title: 'Ignore robots.txt for this crawl?',
      body: (
        <>
          The crawl will also fetch pages on {siteUrl} that robots.txt disallows. Crawl delay, rate
          limits and access controls still apply. Continue only if you are authorized to crawl this
          site. Your confirmation is recorded on the crawl, and Recrawl and scheduled crawls keep
          it.
        </>
      ),
      confirmLabel: 'I am authorized, run crawl',
      onConfirm: () => {
        setConfirm(null);
        onStart('ignore');
      },
    });
  return (
    <>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        onClick={() => onStart('respect')}
        disabled={pending}
      >
        {pending ? 'Starting…' : 'Run new crawl'}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" disabled={pending} aria-label="More crawl options">
            <Icon icon={ChevronDown} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={askToIgnore}>Run new crawl ignoring robots.txt…</MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />
    </>
  );
}
