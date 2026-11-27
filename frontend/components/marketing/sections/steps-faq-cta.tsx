import { useId, type ReactNode } from 'react';

import { Plus } from '@/lib/icons';
import { cn } from '@/lib/utils';

import './steps-faq-cta.css';

const STEPS_DIRECTION = {
  horizontal: 'cl-steps--horizontal',
  vertical: 'cl-steps--vertical',
} as const;

export function Steps({
  items,
  direction = 'horizontal',
}: Readonly<{
  items: readonly Readonly<{ title: string; body?: ReactNode; meta?: ReactNode }>[];
  direction?: 'horizontal' | 'vertical';
}>) {
  return (
    <ol className={cn('cl-steps', STEPS_DIRECTION[direction])}>
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
            <Plus aria-hidden className="cl-faq-icon shrink-0" />
          </summary>
          <div className="cl-faq-a">
            {typeof item.answer === 'string' ? <p>{item.answer}</p> : item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

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
