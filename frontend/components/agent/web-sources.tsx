import { ClampText } from '@/components/ui/clamp-text';
import { Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { type AgentWebSource } from '@/lib/api/agent';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';

/**
 * Pages a web search returned, kept apart from the CiteLadder records a reply
 * cites: they are outside observations, not project data.
 */
export function WebSources({
  sources,
  label = 'Web sources',
}: Readonly<{ sources: readonly AgentWebSource[]; label?: string }>) {
  if (sources.length === 0) return null;
  return (
    <Stack as="section" gap="tight" aria-label={label}>
      <span className={textRole('body', 'text-ink-2')}>{label}</span>
      <Stack as="ul" gap="tight">
        {sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <ClampText className={textRole('caption')}>
              <TextLink variant="external" href={source.url} text="caption">
                {source.title.trim() || hostOf(source.url)}
              </TextLink>{' '}
              · {hostOf(source.url)}
            </ClampText>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function hostOf(url: string): string {
  return parseAbsoluteHttpUrl(url)?.hostname ?? url;
}
