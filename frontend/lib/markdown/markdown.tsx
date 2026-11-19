/**
 * Sanitised Markdown renderer for AI-generated content (Content vertical).
 *
 * The model output is UNTRUSTED. Defences, all local to this module:
 *   - raw HTML is never parsed (no `rehype-raw`; react-markdown escapes it),
 *   - URLs pass `safeUrlTransform` (./safe-url) — only http/https/mailto survive
 *     (`javascript:`/`data:`/etc. are neutralised to an empty href),
 *   - links open in a new tab with `rel="noopener noreferrer"`; given
 *     `knownHosts`, a link to any other host first asks the person to confirm
 *     the full address (a prompt-injected page can make the model put project
 *     data in a link),
 *   - a restricted component map (no images, no iframes) with token-only
 *     classes so the output inherits the app theme.
 */
import {
  createContext,
  memo,
  useContext,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ConfirmDialog } from '@/components/ui/dialog';
import { Stack } from '@/components/ui/layout';
import { ScrollFrame } from '@/components/ui/scroll-edges';
import { InlineFigure } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import { highlightPlugin, type Highlight } from './highlight';
import { phraseChipsPlugin } from './phrase-chips';
import { leavesForUnknownHost, safeUrlTransform } from './safe-url';

const NO_CHIPS: readonly PhraseChip[] = [];

type LeaveGuard = Readonly<{
  knownHosts: readonly string[];
  confirmLeave: (href: string) => void;
}>;

/** Set only by a `ContentMarkdown` given `knownHosts`; links read it to decide. */
const LeaveGuardContext = createContext<LeaveGuard | null>(null);

/** Draws a link the caller recognises (a cited source) as its own node; null keeps the plain link. */
export type LinkChip = (href: string, children: ReactNode) => ReactNode | null;

/** Set only by a `ContentMarkdown` given `linkChip`. */
const LinkChipContext = createContext<LinkChip | null>(null);

function MarkdownLink({
  node: _node,
  children,
  href,
  ...props
}: Readonly<ComponentPropsWithoutRef<'a'> & ExtraProps>) {
  const guard = useContext(LeaveGuardContext);
  const chip = useContext(LinkChipContext)?.(href ?? '', children) ?? null;
  const confirm =
    guard !== null && href !== undefined && leavesForUnknownHost(href, guard.knownHosts);
  // Ctrl/Cmd/Shift-click fire `click`; a middle click fires only `auxclick`.
  const intercept = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    event.preventDefault();
    guard?.confirmLeave(href ?? '');
  };
  if (chip !== null) return <>{chip}</>;
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={confirm ? intercept : undefined}
      onAuxClick={confirm ? intercept : undefined}
    >
      {children}
    </a>
  );
}

/** A phrase in the text and what replaces it where it appears whole, such as a record's chip. */
export type PhraseChip = Readonly<{ text: string; node: ReactNode }>;

/** Set only by a `ContentMarkdown` given `chips`; chip slots read it by index. */
const ChipsContext = createContext<readonly PhraseChip[]>([]);

function MarkdownSpan({
  node: _node,
  children,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'> & ExtraProps & { 'data-chip'?: string }>) {
  const chips = useContext(ChipsContext);
  const chip = props['data-chip'] === undefined ? undefined : chips[Number(props['data-chip'])];
  if (chip) return <>{chip.node}</>;
  return <span {...props}>{children}</span>;
}

type HastNode = Readonly<{ type: string; tagName?: string; value?: string; children?: HastNode[] }>;

function hastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(hastText).join('');
}

function hastHeads(node: HastNode): string[] {
  if (node.tagName === 'th') return [hastText(node).trim()];
  return (node.children ?? []).flatMap(hastHeads);
}

/** A reply table's name: "Table: " and its first three column heads. */
function tableName(node: HastNode | undefined): string {
  const heads = node ? hastHeads(node).filter(Boolean) : [];
  if (heads.length === 0) return 'Table';
  const shown = heads.slice(0, 3).join(', ');
  return `Table: ${shown}${heads.length > 3 ? ', …' : ''}`;
}

/** Restricted component map (no props closed over, so it is stable across renders). */
const MARKDOWN_COMPONENTS: Components = {
  // Generated headings begin below the route-owned page title. The raw
  // Markdown remains untouched for copy and export.
  h1: ({ node: _node, children, ...props }) => <h2 {...props}>{children}</h2>,
  h2: ({ node: _node, children, ...props }) => <h3 {...props}>{children}</h3>,
  h3: ({ node: _node, children, ...props }) => <h4 {...props}>{children}</h4>,
  h4: ({ node: _node, children, ...props }) => <h5 {...props}>{children}</h5>,
  h5: ({ node: _node, children, ...props }) => <h6 {...props}>{children}</h6>,
  h6: ({ node: _node, children, ...props }) => <h6 {...props}>{children}</h6>,
  // Untrusted output: never render images (remote-fetch beacon risk).
  img: () => null,
  // A wide table scrolls inside its frame, with the fade and stepper that say
  // so; the frame and the table are named by the table's column heads.
  table: ({ node, ...props }) => {
    const name = tableName(node);
    return (
      <ScrollFrame label={name} className="prose-table-frame">
        {(ref, region) => (
          <div ref={ref} {...region} className="overflow-x-auto">
            <table {...props} aria-label={name} />
          </div>
        )}
      </ScrollFrame>
    );
  },
  // GFM makes a head cell only in the head row, so each one heads its column.
  th: ({ node: _node, ...props }) => <th {...props} scope="col" />,
  // Forward the remaining DOM props (id, aria-describedby,
  // data-footnote-*) so GFM footnote back-links keep working; `node`
  // is react-markdown's AST handle, not a DOM attribute.
  a: MarkdownLink,
  // Markdown never makes a span (raw HTML is escaped); only chip slots do.
  span: MarkdownSpan,
};

type MarkdownBodyProps = Readonly<{
  content: string;
  density: 'default' | 'compact';
  chipTexts: readonly string[];
  highlights: readonly Highlight[];
}>;

function sameItems<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean) {
  return (
    a.length === b.length &&
    a.every((item, i) => {
      const other = b[i];
      return other !== undefined && same(item, other);
    })
  );
}

// Callers pass fresh chip and highlight arrays each render; compare them by value
// so a composer keystroke never re-parses every message.
function sameBody(a: MarkdownBodyProps, b: MarkdownBodyProps) {
  return (
    a.content === b.content &&
    a.density === b.density &&
    sameItems(a.chipTexts, b.chipTexts, (x, y) => x === y) &&
    sameItems(a.highlights, b.highlights, (x, y) => x.text === y.text && x.tone === y.tone)
  );
}

const MarkdownBody = memo(function MarkdownBody({
  content,
  density,
  chipTexts,
  highlights,
}: MarkdownBodyProps) {
  return (
    // Generated Markdown can contain unbreakable URLs, code, and wide tables.
    // Text wraps to the column; a table that still cannot fit scrolls inside
    // its own frame, never as one scrollbar at the bottom of a long result.
    <div
      className={cn(
        'prose-content min-w-0 w-full max-w-full [overflow-wrap:anywhere]',
        density === 'compact' && 'prose-compact',
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          ...(chipTexts.length ? [phraseChipsPlugin(chipTexts)] : []),
          ...(highlights.length ? [highlightPlugin(highlights)] : []),
        ]}
        urlTransform={safeUrlTransform}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}, sameBody);

/** Render untrusted Markdown safely (GFM tables/lists, no raw HTML). */
export function ContentMarkdown({
  markdown,
  density = 'default',
  highlights = [],
  chips = NO_CHIPS,
  knownHosts,
  linkChip,
}: Readonly<{
  markdown: string;
  density?: 'default' | 'compact';
  /** Exact phrases to mark where they appear whole inside one text run. */
  highlights?: readonly Highlight[];
  /** Exact phrases to replace with a node where they stand alone outside links and code. */
  chips?: readonly PhraseChip[];
  /**
   * Hosts a link may open directly (each also covers its subdomains); a link
   * anywhere else opens only after a "You're leaving CiteLadder" confirm that
   * shows its full address. Omitted, every link opens directly.
   */
  knownHosts?: readonly string[];
  /** Replaces a link it recognises; links it returns null for render as plain links. */
  linkChip?: LinkChip;
}>) {
  const content = markdown ?? '';
  const [leaving, setLeaving] = useState<string | null>(null);
  const guard = useMemo<LeaveGuard | null>(
    () => (knownHosts ? { knownHosts, confirmLeave: setLeaving } : null),
    [knownHosts],
  );
  const body = (
    <MarkdownBody
      content={content}
      density={density}
      chipTexts={chips.map((chip) => chip.text)}
      highlights={highlights}
    />
  );
  const phrased = chips.length ? (
    <ChipsContext.Provider value={chips}>{body}</ChipsContext.Provider>
  ) : (
    body
  );
  const chipped = linkChip ? (
    <LinkChipContext.Provider value={linkChip}>{phrased}</LinkChipContext.Provider>
  ) : (
    phrased
  );
  if (!guard) return chipped;
  return (
    <LeaveGuardContext.Provider value={guard}>
      {chipped}
      <ConfirmDialog
        request={
          leaving === null
            ? null
            : {
                title: 'You’re leaving CiteLadder',
                body: (
                  <Stack gap="tight">
                    <p>
                      This link goes to an address that is not your project’s site or a cited
                      source. Check the full address before you open it.
                    </p>
                    <p className="text-ink [overflow-wrap:anywhere]">
                      <InlineFigure>{leaving}</InlineFigure>
                    </p>
                  </Stack>
                ),
                confirmLabel: 'Open link',
                onConfirm: () => {
                  window.open(leaving, '_blank', 'noopener,noreferrer');
                  setLeaving(null);
                },
              }
        }
        onCancel={() => setLeaving(null)}
      />
    </LeaveGuardContext.Provider>
  );
}

const asParagraph: Components['p'] = ({ children }) => <p>{children}</p>;
const asCell: Components['td'] = ({ children }) => <>{children} </>;
/** Kept blocks only; everything else (links, emphasis, images, task boxes) is unwrapped to its words. */
const TEXT_ELEMENTS = [
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'th',
  'td',
];
const TEXT_COMPONENTS: Components = {
  h1: asParagraph,
  h2: asParagraph,
  h3: asParagraph,
  h4: asParagraph,
  h5: asParagraph,
  h6: asParagraph,
  tr: asParagraph,
  th: asCell,
  td: asCell,
};

/**
 * Markdown as its words in paragraphs and lists, for a live region: no link,
 * heading, table or image, so it adds nothing to focus or navigate.
 */
export const MarkdownText = memo(function MarkdownText({
  markdown,
}: Readonly<{ markdown: string }>) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={TEXT_ELEMENTS}
      unwrapDisallowed
      components={TEXT_COMPONENTS}
    >
      {markdown}
    </ReactMarkdown>
  );
});
