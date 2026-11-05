import type { ReactNode } from 'react';

import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { Rungs, type RungLevel } from '@/components/ui/rungs';
import { cn } from '@/lib/utils';

import { Eyebrow, SiteArrowLink, columnsFor } from './site-parts';

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

/** RelatedCards: where to go next, one linked card each, 2 to 4 a row. */
export function RelatedCards({ items }: Readonly<{ items: readonly RelatedCard[] }>) {
  return (
    <ul className={cn('cl-related', `cl-cols-${columnsFor(items.length)}`)}>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} className="cl-related-card focus-ring">
            {item.eyebrow && <span className="type-eyebrow cl-eyebrow">{item.eyebrow}</span>}
            <h3 className="cl-related-title">{item.title}</h3>
            {item.body && <span className="cl-related-text">{item.body}</span>}
            <SiteArrowLink className="cl-related-more">{item.linkLabel ?? 'Read'}</SiteArrowLink>
          </a>
        </li>
      ))}
    </ul>
  );
}

export type QuestionCard = Readonly<{
  question: string;
  /** Defaults to "Buyer prompt"; `false` for a question that is not a prompt. */
  eyebrow?: ReactNode;
  /** The citation level the brand reached on this prompt. */
  rungs?: RungLevel;
  meta?: ReactNode;
}>;

/** QuestionCards: the buyer prompts a capability answers, as quiet cards. */
export function QuestionCards({ items }: Readonly<{ items: readonly QuestionCard[] }>) {
  return (
    <ul className={cn('cl-qcards', `cl-cols-${columnsFor(items.length)}`)}>
      {items.map((item) => (
        <li key={item.question} className="cl-qcard">
          {item.eyebrow !== false && <Eyebrow>{item.eyebrow ?? 'Buyer prompt'}</Eyebrow>}
          <p className="cl-qcard-q">{item.question}</p>
          {(item.rungs !== undefined || item.meta) && (
            <div className="cl-qcard-foot">
              {item.rungs === undefined ? <span /> : <Rungs level={item.rungs} showLabel />}
              {item.meta && <span className="cl-qcard-meta">{item.meta}</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * LogoTile: an integration or engine as a tile, its mark over its name. With
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
