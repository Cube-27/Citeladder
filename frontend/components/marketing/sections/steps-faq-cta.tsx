import { useId, type ReactNode } from 'react';
import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

import './steps-faq-cta.css';

/**
 * Steps: an ordered process, side by side (two up under 1024, stacked on
 * phones) or as a vertical list.
 */
export function Steps({
  items,
  direction = 'horizontal',
}: Readonly<{
  items: readonly Readonly<{ title: string; body?: ReactNode; meta?: ReactNode }>[];
  direction?: 'horizontal' | 'vertical';
}>) {
  return (
    <ol className={cn('cl-steps', `cl-steps--${direction}`)}>
      {items.map((step) => (
        <li key={step.title} className="cl-step">
          <div className="cl-step-body">
            <h3 className="cl-step-title">{step.title}</h3>
            {step.body && <p className="cl-step-text">{step.body}</p>}
            {step.meta && <p className="cl-step-meta">{step.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type FaqItem = Readonly<{ id?: string; question: string; answer: ReactNode }>;

/**
 * FaqList: native details rows. Opening one only adds its answer below its
 * own row; with `exclusive` the browser keeps one open at a time.
 */
export function FaqList({
  items,
  exclusive = false,
}: Readonly<{ items: readonly FaqItem[]; exclusive?: boolean }>) {
  const group = useId();
  return (
    <div className="cl-faq">
      {items.map((item) => (
        <details
          key={item.question}
          id={item.id}
          className="cl-faq-item"
          name={exclusive ? group : undefined}
        >
          <summary className="cl-faq-q focus-ring">
            <span>{item.question}</span>
            <Plus aria-hidden className="cl-faq-icon size-5 shrink-0" />
          </summary>
          <div className="cl-faq-a">
            {typeof item.answer === 'string' ? <p>{item.answer}</p> : item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * CtaBand: the closing call to action, a stage inside the container (never
 * full-bleed), the title at the section size over the lead and actions.
 */
export function CtaBand({
  title,
  lead,
  actions,
  note,
  as: Heading = 'h2',
}: Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  actions: ReactNode;
  note?: ReactNode;
  as?: 'h2' | 'h3';
}>) {
  return (
    // `data-cta-placement` names where a clicked call to action sat, for marketing analytics.
    <div className="cl-cta" data-cta-placement="closing">
      <div className="cl-cta-copy">
        <Heading className="cl-cta-title">{title}</Heading>
        {lead && <p className="cl-lead cl-cta-lead">{lead}</p>}
      </div>
      <div className="cl-cta-side">
        <div className="cl-cta-actions">{actions}</div>
        {note && <p className="cl-cta-note">{note}</p>}
      </div>
    </div>
  );
}
