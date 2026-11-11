'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';

import { Callout } from '@/components/ui/callout';
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { QueryState } from '@/components/ui/query-state';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Inline, Stack } from '@/components/ui/layout';
import { commerceMutations } from '@/lib/api/commerce';
import type { CommerceTarget } from '@citeladder/contracts/commerce-suite';
import { LaunchDialog } from '@/components/runs/launch-dialog';
import { ProjectLink } from '@/components/ui/project-link';
import { useRunEvents } from '@/lib/runs/use-run-events';
import { CategoryMatrixSheet } from './category-matrix-sheet';
import { sameTarget } from '@/lib/products/targets';

import type { CommerceQueries } from './commerce-queries';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

// Per hero product; the API defaults the count, and a category generates its matrix.
const HERO_COUNT = 3;

function forTarget(
  rows: NonNullable<CommerceQueries['buyerPrompts']['data']>,
  target: CommerceTarget,
) {
  return rows.filter((row) => sameTarget(row.target, target));
}

export function TargetPrompts({
  projectId,
  target,
  targetLabel,
  query,
}: Readonly<{
  projectId: string;
  target: CommerceTarget;
  targetLabel: string;
  query: CommerceQueries['buyerPrompts'];
}>) {
  const workspaceId = useActiveWorkspaceId();
  const [text, setText] = useState('');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchedAuditId, setLaunchedAuditId] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  // The audit stream refreshes AI Shelf and Actions here when the run finishes.
  useRunEvents(launchedAuditId, projectId, Boolean(launchedAuditId));
  const scope = { workspaceId, projectId };
  const generate = useMutation(commerceMutations.generateBuyerPrompts(scope));
  const generatePrompts = () =>
    generate.mutate(
      { targets: [target], count: HERO_COUNT, hero: true },
      {
        onSuccess: (created) => setShortfall(created.length < HERO_COUNT ? created.length : null),
      },
    );
  const manual = useMutation(commerceMutations.addBuyerPrompt(scope));
  const addPrompt = () => manual.mutate({ target, text }, { onSuccess: () => setText('') });
  const decide = useMutation(commerceMutations.decideBuyerPrompt(scope));
  const rows = query.data ? forTarget(query.data, target) : [];
  const approvedIds = rows.reduce<string[]>((ids, row) => {
    if (row.enabled) ids.push(row.id);
    return ids;
  }, []);
  const busy = [generate.isPending, manual.isPending, decide.isPending].some(Boolean);
  const failed = [generate.isError, manual.isError, decide.isError].some(Boolean);
  return (
    <Card>
      <CardHeader
        actions={
          <>
            {target.kind === 'category' ? (
              // The sheet reads loaded prompts only; the list below owns loading and error states.
              <Button
                variant="secondary"
                disabled={busy || !query.data}
                onClick={() => setMatrixOpen(true)}
              >
                Shopping prompts matrix
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={generatePrompts}>
                {generate.isPending
                  ? 'Generating…'
                  : `Generate ${HERO_COUNT} for this hero product`}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!approvedIds.length || busy}
              onClick={() => setLaunchOpen(true)}
            >
              Review and launch
            </Button>
          </>
        }
      >
        <CardTitle>Prompts that measure it</CardTitle>
        <CardDescription>
          {approvedIds.length
            ? 'Generated prompts stay disabled until you approve them.'
            : 'Approve at least one prompt to launch an audit for this target.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack>
          {failed ? (
            <Callout tone="negative">The buyer-prompt update failed. Please try again.</Callout>
          ) : null}
          {shortfall !== null ? (
            <Callout tone="info">
              {shortfall} of {HERO_COUNT} generated prompts were usable. Generate again for more.
            </Callout>
          ) : null}
          {launchedAuditId ? (
            <Callout tone="info">
              Audit launched. Shelf metrics update here when it finishes.{' '}
              <ProjectLink href={`/runs/${launchedAuditId}`}>View the run</ProjectLink>
            </Callout>
          ) : null}
          {target.kind === 'category' ? (
            <CategoryMatrixSheet
              projectId={projectId}
              categoryId={target.id}
              categoryLabel={targetLabel}
              rows={rows}
              open={matrixOpen}
              onOpenChange={setMatrixOpen}
            />
          ) : null}
          <LaunchDialog
            open={launchOpen}
            onOpenChange={setLaunchOpen}
            projectId={projectId}
            fixedPromptIds={approvedIds}
            promptSelectionLabel={`${approvedIds.length} approved prompts for ${targetLabel}`}
            auditScope="commerce"
            onLaunched={(audit) => setLaunchedAuditId(audit.id)}
          />
          <PromptRows
            query={query}
            rows={rows}
            pending={busy}
            onToggle={(id, approved) => decide.mutate({ id, approved })}
          />
          {/* Manual entry is the fallback for an unconfigured model, so it is
            folded away rather than given equal billing beside Generate. */}
          <Disclosure title="Add a prompt manually">
            <Textarea
              aria-label="Manual buyer prompt"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="best instant read thermometer for grilling under $50"
            />
            <div>
              <Button variant="primary" disabled={!text.trim() || busy} onClick={addPrompt}>
                Add prompt
              </Button>
            </div>
          </Disclosure>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PromptRows({
  query,
  rows,
  pending,
  onToggle,
}: Readonly<{
  query: CommerceQueries['buyerPrompts'];
  rows: NonNullable<CommerceQueries['buyerPrompts']['data']>;
  pending: boolean;
  onToggle: (id: string, approved: boolean) => void;
}>) {
  if (query.isError)
    return <ReadError {...readErrorProps(query)} fallback="Buyer prompts could not be loaded." />;
  if (query.isPending) return <QueryState kind="loading" />;
  if (!rows.length) {
    return (
      <QueryState
        kind="empty"
        icon={MessageSquare}
        heading="No prompts yet for this target"
        description="Generate a set, or add one manually."
        headingLevel={3}
      />
    );
  }
  return (
    <ul className={ledgerClasses()}>
      {rows.map((row) => (
        <Inline as="li" key={row.id} gap="compact" className={ledgerItemClasses('flex-wrap')}>
          <span className="text-ink-secondary min-w-0 flex-1">{row.text}</span>
          <Button
            variant={row.enabled ? 'secondary' : 'primary'}
            disabled={pending}
            onClick={() => onToggle(row.id, !row.enabled)}
          >
            {row.enabled ? 'Disable' : 'Approve'}
          </Button>
        </Inline>
      ))}
    </ul>
  );
}
