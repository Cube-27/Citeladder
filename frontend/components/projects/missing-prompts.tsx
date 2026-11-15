import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

import { ProjectLink } from '@/components/ui/project-link';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { missingPrompts, promptHistoryHref, type MissingPrompt } from '@/lib/prompts/history';
import { useEngineCatalog } from '@/lib/providers/engines';

import { useLatestPromptMetrics } from '@/components/prompts/use-latest-prompt-measurements';
import { Notice } from '@/components/ui/notice';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

/** Rows shown on Overview; the rest are one click away in Prompts. */
const SHOWN = 5;

/**
 * Overview's "Where you're missing": prompts in the latest run (default
 * market) whose answers named a competitor but not the brand, with the
 * engines that did so and the Action that targets each prompt.
 */
export function MissingPrompts({
  projectId,
  workspaceId,
}: Readonly<{ projectId: string; workspaceId: string }>) {
  const query = useLatestPromptMetrics({ workspaceId, projectId });
  const rows = useMemo(() => missingPrompts(query.data ?? []), [query.data]);
  // No run yet has nothing to compare, so the section stays out of the way.
  if (query.isPending || query.data?.length === 0) return null;
  return (
    <Section aria-labelledby="missing-prompts">
      <SectionHeader
        actions={
          rows.length > SHOWN ? (
            <Button asChild variant="quiet">
              <ProjectLink href="/prompts">
                All prompts <Icon icon={ArrowRight} />
              </ProjectLink>
            </Button>
          ) : null
        }
      >
        <SectionTitle id="missing-prompts">{"Where you're missing"}</SectionTitle>
        <SectionDescription>
          Prompts in the latest run where an answer named a competitor but not you.
        </SectionDescription>
      </SectionHeader>
      <Stack as={SectionContent} gap="compact">
        {query.isError ? (
          <Notice
            kind="read"
            error={query.error}
            fallback="Prompt results could not be loaded."
            onRetry={() => void query.refetch()}
            pending={query.isFetching}
          />
        ) : null}
        {query.data && rows.length === 0 ? (
          <p className={textRole('caption')}>
            No answer in the latest run named a tracked competitor while leaving you out.
          </p>
        ) : null}
        {rows.length ? (
          <ul className={ledgerClasses()}>
            {rows.slice(0, SHOWN).map((row) => (
              <MissingRow key={row.promptId} row={row} />
            ))}
          </ul>
        ) : null}
      </Stack>
    </Section>
  );
}

function MissingRow({ row }: Readonly<{ row: MissingPrompt }>) {
  const engines = useEngineCatalog();
  return (
    <Inline as="li" gap="compact" className={ledgerItemClasses('flex-wrap justify-between')}>
      <Stack gap="tight" className="min-w-0">
        <TextLink href={promptHistoryHref(row.promptId)}>{row.text}</TextLink>
        <span className="type-caption">
          {row.engines.map(engines.label).join(', ')} named {row.competitors.join(', ')}
        </span>
      </Stack>
      {row.actionId ? (
        <Button asChild variant="secondary">
          <ProjectLink href={`/agent/actions/${row.actionId}`}>Open the Action</ProjectLink>
        </Button>
      ) : (
        <span className="type-caption">No Action yet</span>
      )}
    </Inline>
  );
}
