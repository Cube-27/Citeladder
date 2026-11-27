import { BrandMark } from '@/components/ui/brand-mark';
import { ClampText } from '@/components/ui/clamp-text';
import { UrlText } from '@/components/ui/table';
import { StatusMark } from '@/components/ui/status-mark';
import { DisplayTime } from '@/components/ui/display-time';
import { FactList } from '@/components/ui/facts';
import { Inline, Stack } from '@/components/ui/layout';
import { SectionBleed } from '@/components/ui/section';
import { TextLink } from '@/components/ui/text-link';
import { Text } from '@/components/ui/typography';
import type { ActionDetail } from '@/lib/api/actions';
import { formatCount, pluralCount, readableUrl } from '@/lib/format';
import { promptHistoryHref } from '@/lib/prompts/history';
import { classificationLabel } from '@citeladder/contracts/page-labels';
import { classificationBadgeValue } from '@/lib/runs/status';
import { citationClassificationSchema } from '@citeladder/contracts/audits';
import type { ContentGapEvidence } from '@citeladder/contracts/opportunity-evidence';

export type GapMember = Readonly<{ id: string; evidence: ContentGapEvidence }>;

const DELETED_PROMPT = 'A prompt no longer in your library';

export function contentGapMembers(action: ActionDetail): GapMember[] {
  return action.members.flatMap((member) =>
    member.content_gap_evidence ? [{ id: member.id, evidence: member.content_gap_evidence }] : [],
  );
}

export function ContentGapWhy({ members }: Readonly<{ members: readonly GapMember[] }>) {
  return (
    <SectionBleed as="ul" rows>
      {members.map((member) => (
        <li key={member.id} className="min-w-0">
          <GapAngle evidence={member.evidence} />
        </li>
      ))}
    </SectionBleed>
  );
}

function GapAngle({ evidence }: Readonly<{ evidence: ContentGapEvidence }>) {
  return (
    <Stack>
      <Text as="p" variant="body">
        {evidence.angle_label}
      </Text>
      <GapEvidence evidence={evidence} />
    </Stack>
  );
}

export function GapEvidence({ evidence }: Readonly<{ evidence: ContentGapEvidence }>) {
  const { prompts } = evidence;
  const continues = 'continues_action_id' in evidence ? evidence.continues_action_id : undefined;
  return (
    <>
      <FactList
        layout="inline"
        label="Counts"
        facts={[
          { label: 'Citations', value: formatCount(evidence.citation_count) },
          { label: 'Sites', value: formatCount(evidence.domain_count) },
          { label: 'Competitors', value: formatCount(evidence.competitor_count) },
          { label: 'Prompts', value: formatCount(prompts.length) },
          {
            label: 'Window',
            value: (
              <span>
                <DisplayTime value={evidence.window.start} dateOnly /> to{' '}
                <DisplayTime value={evidence.window.end} dateOnly />
              </span>
            ),
          },
        ]}
      />
      <Stack as="section" gap="tight" aria-label="Cited pages">
        <Text variant="body" tone="ink-2">
          Cited pages
        </Text>
        <Stack as="ul" gap="item">
          {evidence.members.map((page) => (
            <CitedPage key={page.url} page={page} />
          ))}
        </Stack>
        {evidence.member_count > evidence.members.length ? (
          <Text variant="caption">
            The {formatCount(evidence.members.length)} most cited of{' '}
            {pluralCount(evidence.member_count, 'page')}.
          </Text>
        ) : null}
      </Stack>
      {prompts.length > 0 ? (
        <Stack as="section" gap="tight" aria-label="Prompts">
          <Text variant="body" tone="ink-2">
            Prompts
          </Text>
          <Stack as="ul" gap="tight">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="min-w-0">
                {prompt.text === null ? (
                  <Text variant="body" tone="ink-2">
                    {DELETED_PROMPT}
                  </Text>
                ) : (
                  <ClampText tooltip={prompt.text}>
                    <TextLink href={promptHistoryHref(prompt.id)} text="body">
                      {prompt.text}
                    </TextLink>
                  </ClampText>
                )}
              </li>
            ))}
          </Stack>
        </Stack>
      ) : null}
      {continues ? (
        <TextLink href={`/actions/${continues}`} text="body" className="justify-self-start">
          Continues the planned page for this angle
        </TextLink>
      ) : null}
    </>
  );
}

function CitedPage({ page }: Readonly<{ page: ContentGapEvidence['members'][number] }>) {
  const classification = citationClassificationSchema.safeParse(page.classification);
  const site = page.matched_competitor
    ? `${page.matched_competitor} (${page.domain})`
    : page.domain;
  return (
    <Stack as="li" gap="tight" className="min-w-0">
      {page.title ? (
        <ClampText tooltip={readableUrl(page.url)}>
          <TextLink variant="external" href={page.url} text="body">
            {page.title}
          </TextLink>
        </ClampText>
      ) : (
        <TextLink variant="external" href={page.url} text="body" className="flex min-w-0">
          <UrlText url={page.url} />
        </TextLink>
      )}
      <Inline gap="compact" wrap>
        {classification.success ? (
          <StatusMark
            variant="classification"
            value={classificationBadgeValue(classification.data)}
          >
            {classificationLabel(classification.data)}
          </StatusMark>
        ) : null}
        <BrandMark
          name={page.matched_competitor || page.domain}
          websiteUrl={page.domain}
          placement="inline"
          entity="site"
        />
        <Text variant="caption">
          {site} · {pluralCount(page.citation_count, 'citation')}
        </Text>
      </Inline>
    </Stack>
  );
}
