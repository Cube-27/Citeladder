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
import { useScrollFrame } from '@/components/ui/scroll-edges';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import { highlightPlugin, type Highlight } from './highlight';
import './prose.css';
import { phraseChipsPlugin } from './phrase-chips';
import { leavesForUnknownHost, safeUrlTransform } from './safe-url';

const NO_CHIPS: readonly PhraseChip[] = [];

type LeaveGuard = Readonly<{
  knownHosts: readonly string[];
  confirmLeave: (href: string) => void;
}>;

const LeaveGuardContext = createContext<LeaveGuard | null>(null);

export type LinkChip = (href: string, children: ReactNode) => ReactNode | null;

const LinkChipContext = createContext<LinkChip | null>(null);

type FootnoteMarks = { 'data-footnote-ref'?: boolean; 'data-footnote-backref'?: string };

function MarkdownLink({
  children,
  href,
  title,
  id,
  'aria-describedby': describedBy,
  'aria-label': label,
  'data-footnote-ref': footnoteRef,
  'data-footnote-backref': footnoteBackref,
}: Readonly<ComponentPropsWithoutRef<'a'> & ExtraProps & FootnoteMarks>) {
  const guard = useContext(LeaveGuardContext);
  const chip = useContext(LinkChipContext)?.(href ?? '', children) ?? null;
  const confirm =
    guard !== null && href !== undefined && leavesForUnknownHost(href, guard.knownHosts);
  const intercept = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    event.preventDefault();
    guard?.confirmLeave(href ?? '');
  };
  if (chip !== null) return <>{chip}</>;
  return (
    <a
      href={href}
      title={title}
      id={id}
      aria-describedby={describedBy}
      aria-label={label}
      data-footnote-ref={footnoteRef}
      data-footnote-backref={footnoteBackref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={confirm ? intercept : undefined}
      onAuxClick={confirm ? intercept : undefined}
    >
      {children}
    </a>
  );
}

export type PhraseChip = Readonly<{ text: string; node: ReactNode }>;

const ChipsContext = createContext<readonly PhraseChip[]>([]);

function MarkdownSpan({
  children,
  'data-chip': chipIndex,
}: Readonly<ComponentPropsWithoutRef<'span'> & ExtraProps & { 'data-chip'?: string }>) {
  const chips = useContext(ChipsContext);
  const chip = chipIndex === undefined ? undefined : chips[Number(chipIndex)];
  if (chip) return <>{chip.node}</>;
  return <span data-chip={chipIndex}>{children}</span>;
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

function tableName(node: HastNode | undefined): string {
  const heads = node ? hastHeads(node).filter(Boolean) : [];
  if (heads.length === 0) return 'Table';
  const shown = heads.slice(0, 3).join(', ');
  return `Table: ${shown}${heads.length > 3 ? ', …' : ''}`;
}

function demoted(Tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function DemotedHeading({
    id,
    className,
    children,
  }: Readonly<ComponentPropsWithoutRef<'h1'>>) {
    return (
      <Tag id={id} className={className === 'sr-only' ? 'sr-only' : undefined}>
        {children}
      </Tag>
    );
  };
}

const MARKDOWN_COMPONENTS: Components = {
  h1: demoted('h2'),
  h2: demoted('h3'),
  h3: demoted('h4'),
  h4: demoted('h5'),
  h5: demoted('h6'),
  h6: demoted('h6'),
  img: () => null,
  table: ({ node, children }) => <MarkdownTable name={tableName(node)}>{children}</MarkdownTable>,
  th: ({ style, children }) => (
    <th
      scope="col"
      className={
        CELL_ALIGN[
          style?.textAlign === 'center' || style?.textAlign === 'right' ? style.textAlign : 'start'
        ]
      }
    >
      {children}
    </th>
  ),
  a: MarkdownLink,
  span: MarkdownSpan,
};

const CELL_ALIGN = { start: undefined, center: 'text-center', right: 'text-right' } as const;

function MarkdownTable({ name, children }: Readonly<{ name: string; children: ReactNode }>) {
  const { ref, region, frame } = useScrollFrame({ label: name });
  return (
    <div {...frame} className="prose-table-frame grid min-w-0">
      <div ref={ref} {...region} className="overflow-x-auto">
        <table aria-label={name}>{children}</table>
      </div>
    </div>
  );
}

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
    <div
      className={cn(
        'prose-content min-w-0 w-full max-w-full wrap-anywhere',
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
  highlights?: readonly Highlight[];
  chips?: readonly PhraseChip[];
  knownHosts?: readonly string[];
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
                    <Text as="p" variant="body" wrap="anywhere">
                      <Text variant="body" numeric>
                        {leaving}
                      </Text>
                    </Text>
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
