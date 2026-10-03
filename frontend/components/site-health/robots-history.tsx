import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { siteHealthQueries } from '@/lib/api/site-health';
import { robotsLineDiff } from '@/lib/site-health/robots-diff';

export function RobotsHistory({
  workspaceId,
  projectId,
}: Readonly<{
  workspaceId: string;
  projectId: string;
}>) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const query = useQuery(siteHealthQueries.robotsHistory(workspaceId, projectId, cursors.at(-1)));
  if (query.isPending) return <output>Loading robots.txt observations…</output>;
  if (query.isError) return <Alert tone="warning">robots.txt history is unavailable.</Alert>;
  const page = query.data;
  const snapshots = new Map(page.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const versions = page.items
    .filter((item) => item.robots.robots_snapshot_id)
    .map((item) => ({ value: item.crawl_id, label: item.observed_at }));
  const snapshotFor = (id: string) =>
    snapshots.get(page.items.find((item) => item.crawl_id === id)?.robots.robots_snapshot_id ?? '');
  const before = snapshotFor(beforeId);
  const after = snapshotFor(afterId);
  return (
    <>
      {page.items.length === 0 ? (
        <p>No robots.txt observations are available.</p>
      ) : (
        <Table>
          <caption className="sr-only">robots.txt observation sequence</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Observed</TableHead>
              <TableHead>Fetch status</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead>Snapshot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((item) => (
              <TableRow key={item.crawl_id}>
                <TableCell>
                  <time dateTime={item.observed_at}>{item.observed_at}</time>
                </TableCell>
                <TableCell>{item.robots.status.replaceAll('_', ' ')}</TableCell>
                <TableCell>
                  {item.robots.bots
                    .map((bot) => `${bot.label}: ${bot.policy.replaceAll('_', ' ')}`)
                    .join('; ')}
                </TableCell>
                <TableCell>{item.robots.robots_snapshot_id ?? 'No body observed'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length === 1}
          onClick={() => {
            setCursors((values) => values.slice(0, -1));
            setBeforeId('');
            setAfterId('');
          }}
        >
          Previous observations
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!page.next_cursor}
          onClick={() => {
            setCursors((values) => [...values, page.next_cursor ?? undefined]);
            setBeforeId('');
            setAfterId('');
          }}
        >
          Older observations
        </Button>
      </div>
      <Select
        ariaLabel="Before robots.txt observation"
        value={beforeId}
        onValueChange={setBeforeId}
        options={[{ value: '', label: 'Select before observation' }, ...versions]}
      />
      <Select
        ariaLabel="After robots.txt observation"
        value={afterId}
        onValueChange={setAfterId}
        options={[{ value: '', label: 'Select after observation' }, ...versions]}
      />
      {before && after ? (
        <>
          {before.truncated || after.truncated ? (
            <Alert tone="warning">
              A retained robots.txt body was truncated. This diff covers only retained text.
            </Alert>
          ) : null}
          <p className={textRole('caption')}>
            Removed lines start with − from the Before observation; added lines start with + from
            the After observation. Choose two observations on this page.
          </p>
          <pre
            aria-label="robots.txt line diff"
            className={textRole('body', 'max-h-96 overflow-auto whitespace-pre-wrap bg-well p-3')}
          >
            {robotsLineDiff(before.body, after.body)}
          </pre>
        </>
      ) : null}
    </>
  );
}
