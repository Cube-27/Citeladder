import type { ReactNode } from 'react';

import { EngineMark, type EngineKey } from '@/components/ui/engine-mark';
import { ArrowRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

import './cards.css';

type ListedEngine = EngineKey | 'google_ai_mode';

const ENGINE_NAMES: Readonly<Record<ListedEngine, string>> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  google: 'Google AI Overviews',
  google_ai_mode: 'Google AI Mode',
};

const markOf = (engine: ListedEngine): EngineKey =>
  engine === 'google_ai_mode' ? 'google' : engine;

export type RelatedCard = Readonly<{
  href: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  linkLabel?: string;
}>;

export function RelatedCards({
  items,
  layout = 'index',
}: Readonly<{ items: readonly RelatedCard[]; layout?: 'index' | 'columns' }>) {
  return (
    <ul className={cn('cl-related', layout === 'columns' && 'cl-related--columns')}>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} className="cl-related-row focus-ring">
            <div className="cl-related-head">
              {item.eyebrow && <span className="cl-kicker cl-eyebrow">{item.eyebrow}</span>}
              <h3 className="cl-related-title">{item.title}</h3>
            </div>{' '}
            {item.body && <span className="cl-related-text">{item.body}</span>}
            {item.linkLabel && <span className="sr-only"> {item.linkLabel}</span>}
            <ArrowRight aria-hidden className="cl-related-arrow" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function QuestionCards({ questions }: Readonly<{ questions: readonly string[] }>) {
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
  const mark = logo ?? (engine ? <EngineMark engine={engine} placement="card" /> : null);
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

export function EngineStrip({
  label = 'Answers collected from',
  engines = ['chatgpt', 'claude', 'gemini', 'google', 'google_ai_mode'],
  names = {},
}: Readonly<{
  label?: string;
  engines?: readonly ListedEngine[];
  names?: Readonly<Partial<Record<ListedEngine, string>>>;
}>) {
  return (
    <div className="cl-engines">
      <p className="cl-engines-label">{label}</p>
      <ul className="cl-engines-list" aria-label={label}>
        {engines.map((engine) => (
          <li key={engine} className="cl-engine">
            <EngineMark engine={markOf(engine)} brand />
            <span>{names[engine] ?? ENGINE_NAMES[engine]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
