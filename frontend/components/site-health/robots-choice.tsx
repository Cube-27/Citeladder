import { useState, type CSSProperties } from 'react';
import type { CrawlRobotsChoice, CrawlRobotsHandling } from '@citeladder/contracts';

import { StatusMark } from '@/components/ui/status-mark';
import { ActionButton } from '@/components/ui/actions';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ui/dialog';
import { MenuItem } from '@/components/ui/menu';
import { SplitButton } from '@/components/ui/split-button';
import { Tooltip } from '@/components/ui/tooltip';

/** A page fetched although robots.txt excludes it, because its crawl ignored robots.txt. */
export function RobotsExcludedBadge() {
  return (
    <Tooltip content="robots.txt excludes this page. It was fetched because the crawl ignored robots.txt.">
      <StatusMark tone="warning">Robots.txt excluded</StatusMark>
    </Tooltip>
  );
}

/** How a crawl's robots choice reads beside the crawl button and the schedule; null when it respects robots.txt. */
export function robotsChoiceNote(choice: CrawlRobotsChoice | undefined) {
  if (choice?.handling !== 'ignore') return null;
  return choice.decided_by_email
    ? `Ignores robots.txt (confirmed by ${choice.decided_by_email})`
    : 'Ignores robots.txt';
}

/**
 * The one crawl action (SH-B7): it audits the project's tracked pages again and
 * keeps the newest crawl's robots choice. Its menu switches that choice for
 * this crawl on; ignoring robots.txt needs the person to confirm they are
 * authorized to crawl the site, and the server records who confirmed it.
 */
export function StartCrawlControl({
  siteUrl,
  robots,
  pending,
  onStart,
}: Readonly<{
  siteUrl: string;
  /** The newest crawl's robots choice, which the crawl keeps. */
  robots: CrawlRobotsChoice;
  pending: boolean;
  /** No choice keeps the newest crawl's. */
  onStart: (robots?: CrawlRobotsHandling) => void;
}>) {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const note = robotsChoiceNote(robots);
  const askToIgnore = () =>
    setConfirm({
      title: 'Ignore robots.txt for this crawl?',
      body: (
        <>
          The crawl will also fetch pages on {siteUrl} that robots.txt disallows. Crawl delay, rate
          limits and access controls still apply. Continue only if you are authorized to crawl this
          site. Your confirmation is recorded on the crawl, and later and scheduled crawls keep it.
        </>
      ),
      confirmLabel: 'I am authorized, run crawl',
      onConfirm: () => {
        setConfirm(null);
        onStart('ignore');
      },
    });
  const button = (joint: CSSProperties) => (
    <ActionButton
      action="runCrawl"
      onClick={() => onStart()}
      pending={pending}
      pendingLabel="Starting…"
      style={joint}
    />
  );
  return (
    <>
      <SplitButton
        action={(joint) =>
          note ? <Tooltip content={`${note}.`}>{button(joint)}</Tooltip> : button(joint)
        }
        menuLabel="More crawl options"
        disabled={pending}
      >
        {note ? (
          <MenuItem onSelect={() => onStart('respect')}>Respect robots.txt</MenuItem>
        ) : (
          <MenuItem onSelect={askToIgnore}>Ignore robots.txt</MenuItem>
        )}
      </SplitButton>
      <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />
    </>
  );
}
