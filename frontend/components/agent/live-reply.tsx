import { memo, useDeferredValue } from 'react';

import { Disclosure } from '@/components/ui/disclosure';
import { Stack } from '@/components/ui/layout';
import { cardClasses } from '@/components/ui/card';
import { textRole } from '@/components/ui/typography';
import type { LiveTurn } from '@/lib/agent/live-turns';
import { useAgentLinkHosts } from '@/lib/agent/link-hosts';
import { ContentMarkdown } from '@/lib/markdown/markdown';
import { cn } from '@/lib/utils';

/**
 * The thinking summary, reply and document as they are written, inside the
 * running turn. Each model call's text is its own segment, so a later call
 * adds under the earlier text instead of replacing it. The saved reply
 * replaces the whole running turn.
 */
export function LiveReply({ live: latest }: Readonly<{ live: LiveTurn | undefined }>) {
  const live = useDeferredValue(latest);
  // The turn's sources are known once it is saved; until then only the
  // project's own hosts open directly.
  const knownHosts = useAgentLinkHosts();
  if (!live) return null;
  const { thinking, reply, document } = live;
  const thought = thinking
    .map((segment) => segment.text)
    .filter(Boolean)
    .join('\n\n');
  return (
    <>
      {thought ? (
        <Disclosure title="Thinking">
          <p className={textRole('caption', 'whitespace-pre-wrap')}>{thought}</p>
        </Disclosure>
      ) : null}
      {reply.map((segment) =>
        segment.text ? (
          <ReplySegment key={segment.ordinal} text={segment.text} knownHosts={knownHosts} />
        ) : null,
      )}
      {document?.body ? (
        <LiveDocument title={document.title} body={document.body} knownHosts={knownHosts} />
      ) : null}
    </>
  );
}

/** Memoized, so only the segment being written re-renders its Markdown. */
const ReplySegment = memo(function ReplySegment({
  text,
  knownHosts,
}: Readonly<{ text: string; knownHosts: readonly string[] }>) {
  return <ContentMarkdown markdown={text} density="compact" knownHosts={knownHosts} />;
});

/** Memoized, so reply and thinking deltas do not re-render the document's Markdown. */
const LiveDocument = memo(function LiveDocument({
  title,
  body,
  knownHosts,
}: Readonly<{ title: string | null; body: string; knownHosts: readonly string[] }>) {
  return (
    <Stack
      as="section"
      gap="compact"
      aria-label={title ? `Writing ${title}` : 'Writing the document'}
      className={cn(cardClasses(), 'min-w-0')}
    >
      <span className={textRole('caption')}>Writing…</span>
      {title ? <h2 className={textRole('sectionTitle')}>{title}</h2> : null}
      <ContentMarkdown markdown={body} knownHosts={knownHosts} />
    </Stack>
  );
});
