import type { CitedDomain } from '@citeladder/contracts';

import { Absence } from '@/components/ui/absence';
import { MarkStack } from '@/components/ui/mark-stack';
import { leadingSources } from '@/lib/prompts/filter';

import { NO_ANSWERS } from './prompt-figures';

export function CitedDomainMarks({
  sources,
}: Readonly<{ sources: readonly CitedDomain[] | null }>) {
  if (sources === null) return NO_ANSWERS;
  if (!sources.length) return <Absence state="none" />;
  const { shown, more } = leadingSources(sources);
  return (
    <MarkStack
      marks={shown.map(({ domain, citations, owned }) => ({
        key: domain,
        tip: `${domain}${owned ? ' (yours)' : ''}: ${citations} ${citations === 1 ? 'citation' : 'citations'}`,
        mark: { name: domain, websiteUrl: `https://${domain}`, entity: 'site' },
      }))}
      more={more}
    />
  );
}
