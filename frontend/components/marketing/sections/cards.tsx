import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { cn } from '@/lib/utils';

import './cards.css';

const ENGINE_NAMES: Readonly<Record<EngineKey, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  google: 'Google AI Overviews',
};

export type RelatedCard = Readonly<{
  href: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  linkLabel?: string;
}>;

/**
 * RelatedCards: where to go next, as the website's one link row (the blog
 * index's): each row is the link, the title over its summary and an arrow
 * at the row's right edge, between hairline rules. `columns` lays the rows
 * two up from 1024px, for long lists. A `linkLabel` is for screen readers.
 */
export function RelatedCards({
  items,
  layout = 'index',
}: Readonly<{ items: readonly RelatedCard[]; layout?: 'index' | 'columns' }>) {
  return (
    <ul className={cn('cl-related', layout === 'columns' && 'cl-related--columns')}>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} className="cl-related-row focus-ring">
            <span className="cl-related-head">
              {item.eyebrow && <span className="type-eyebrow cl-eyebrow">{item.eyebrow}</span>}
              <h3 className="cl-related-title">{item.title}</h3>
            </span>{' '}
            {item.body && <span className="cl-related-text">{item.body}</span>}
            {item.linkLabel && <span className="sr-only"> {item.linkLabel}</span>}
            <ArrowRight aria-hidden className="cl-related-arrow size-5" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** QuestionCards: the questions a capability answers, bare, in ruled columns (two or three, by count). */
export function QuestionCards({ questions }: Readonly<{ questions: readonly string[] }>) {
  // Two columns where three would leave a short last row (4 or 8 questions).
  const cols = questions.length % 3 !== 0 && questions.length % 2 === 0 ? 2 : 3;
  return (
    <ul className="cl-qlist" data-cols={cols}>
      {questions.map((question) => (
        <li key={question}>
          <p className="cl-qcard-q">{question}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * LogoTile: an integration or engine as a tile, its mark top-left over its name. With
 * `hideName` the name is for screen readers only; with an `href` the tile links.
 */
export function LogoTile({
  engine,
  name,
  logo,
  caption,
  href,
  hideName = false,
}: Readonly<
  {
    caption?: ReactNode;
    href?: string;
    hideName?: boolean;
  } & (
    | { engine: EngineKey; name?: string; logo?: undefined }
    | { engine?: undefined; name: string; logo?: ReactNode }
  )
>) {
  const label = name ?? (engine ? ENGINE_NAMES[engine] : '');
  const mark = logo ?? (engine ? <EngineMark engine={engine} className="size-7" /> : null);
  const content = (
    <>
      {mark && <span className="cl-logotile-mark">{mark}</span>}
      <span className={mark && hideName ? 'sr-only' : 'cl-logotile-name'}>{label}</span>
      {caption && <span className="cl-logotile-caption">{caption}</span>}
    </>
  );
  return href ? (
    <a href={href} className="cl-logotile focus-ring">
      {content}
    </a>
  ) : (
    <div className="cl-logotile">{content}</div>
  );
}

/**
 * EngineStrip: the answer engines CiteLadder collects from, each mark beside
 * its name, under one muted label.
 */
export function EngineStrip({
  label = 'Answers collected from',
  engines = ['chatgpt', 'claude', 'gemini', 'google'],
  names = {},
}: Readonly<{
  label?: string;
  engines?: readonly EngineKey[];
  /** What the answers are collected through, where that is not the engine's name (an API). */
  names?: Readonly<Partial<Record<EngineKey, string>>>;
}>) {
  return (
    <div className="cl-engines">
      <p className="cl-engines-label">{label}</p>
      <ul className="cl-engines-list" aria-label={label}>
        {engines.map((engine) => (
          <li key={engine} className="cl-engine">
            <EngineMark engine={engine} />
            <span>{names[engine] ?? ENGINE_NAMES[engine]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
