import { memo, useEffect, useRef, useState } from 'react';

import { Disclosure } from '@/components/ui/disclosure';
import { textRole } from '@/components/ui/typography';
import type { LiveTurn } from '@/lib/agent/live-turns';
import { AGENT_STREAM_THROTTLE_MS } from '@/lib/config/agent';
import { useAgentLinkHosts } from '@/lib/agent/link-hosts';
import { ContentMarkdown } from '@/lib/markdown/markdown';
import { DraftSheet } from '@/components/ui/draft-sheet';

/**
 * The thinking summary, reply and document as they are written, inside the
 * running turn. Each model call's text is its own segment, so a later call
 * adds under the earlier text instead of replacing it. The saved reply
 * replaces the whole running turn.
 */
export function LiveReply({ live: latest }: Readonly<{ live: LiveTurn | undefined }>) {
  const live = useThrottled(latest, AGENT_STREAM_THROTTLE_MS);
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

/**
 * The latest value at most once per `ms`, always ending on the newest: the
 * stream's deltas are an outside clock, and this paces the repaint to it.
 */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const paintedAt = useRef(0);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        paintedAt.current = Date.now();
        setShown(value);
      },
      Math.max(0, paintedAt.current + ms - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [value, ms]);
  return shown;
}

/** Memoized, so only the segment being written re-renders its Markdown. */
const ReplySegment = memo(function ReplySegment({
  text,
  knownHosts,
}: Readonly<{ text: string; knownHosts: readonly string[] }>) {
  return <ContentMarkdown markdown={text} density="compact" knownHosts={knownHosts} />;
});

/**
 * The document as it is written, on the one document view's draft face.
 * Memoized, so reply and thinking deltas do not re-render its Markdown.
 */
const LiveDocument = memo(function LiveDocument({
  title,
  body,
  knownHosts,
}: Readonly<{ title: string | null; body: string; knownHosts: readonly string[] }>) {
  return (
    <section aria-label={title ? `Writing ${title}` : 'Writing the document'} className="min-w-0">
      <DraftSheet as="div" state="draft" marker="Draft · writing">
        {title ? <h2 className={textRole('heading')}>{title}</h2> : null}
        <ContentMarkdown markdown={body} knownHosts={knownHosts} />
      </DraftSheet>
    </section>
  );
});
