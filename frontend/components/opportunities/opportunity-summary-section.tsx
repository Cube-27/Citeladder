import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import type { OpportunityDetail } from '@citeladder/contracts';
import { ledgerClasses } from '@/components/ui/workspace';
import { Inline, Stack } from '@/components/ui/layout';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** One deep-link row in the Source list (label + text link, like the tables). */
function SourceLink({
  label,
  href,
  linkText,
}: Readonly<{ label: string; href: string; linkText: string }>) {
  return (
    <Inline gap="compact" className="items-start justify-between">
      <span className="type-caption shrink-0">{label}</span>
      <TextLink href={href} text="body">
        {linkText}
      </TextLink>
    </Inline>
  );
}

/**
 * The result a finding came from, where it is not the page itself: the
 * visibility review and the prompt. The finding's date is on the row that
 * opens it and its page is the Action's target, so neither repeats here.
 * Persistence provenance stays in the API for auditability but is not copy.
 */
export function OpportunitySummarySection({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const auditId = asString(detail.evidence.audit_id);
  if (!auditId && !detail.target_prompt_id) return null;
  return (
    <Stack as="section">
      <h3 className={textRole('subheading')}>Supporting result</h3>
      <div className={ledgerClasses()}>
        {auditId ? (
          <SourceLink label="Visibility review" href={`/runs/${auditId}`} linkText="View result" />
        ) : null}
        {detail.target_prompt_id ? (
          <SourceLink label="Question" href="/prompts" linkText="Open prompt library" />
        ) : null}
      </div>
    </Stack>
  );
}
