import { ArrowRight, Sparkle, type LucideIcon } from 'lucide-react';
import { useId, type CSSProperties } from 'react';

export type Capability = Readonly<{ href: string; text: string; icon: LucideIcon }>;

/** A row's place in the list, which sets when the highlight reaches it. */
const rowOrder = (index: number): CSSProperties & Record<'--capl-i', number> => ({
  '--capl-i': index,
});

/**
 * CapabilityPanel: what the product does, as the answer to one question
 * (D52). Each row is a short statement linking to its module page. From 768px
 * a highlight steps down the rows, in CSS only and only for a list of ten
 * (`data-rows`); pointing at or focusing a row stops it. Phones do not show
 * the panel.
 */
export function CapabilityPanel({
  question,
  items,
}: Readonly<{ question: string; items: readonly Capability[] }>) {
  const questionId = useId();
  return (
    <div className="cl-capl">
      <p id={questionId} className="cl-capl-ask">
        <Sparkle aria-hidden />
        <span>{question}</span>
      </p>
      <ul className="cl-capl-list" aria-labelledby={questionId} data-rows={items.length}>
        {items.map(({ href, text, icon: Icon }, index) => (
          <li key={href} style={rowOrder(index)}>
            <a href={href} className="cl-capl-row focus-ring">
              <Icon className="cl-capl-ico" aria-hidden />
              <span className="cl-capl-text">{text}</span>
              <ArrowRight className="cl-capl-go" aria-hidden />
            </a>
          </li>
        ))}
        <li className="cl-capl-glide" aria-hidden />
      </ul>
    </div>
  );
}
