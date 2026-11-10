import { useId, type CSSProperties } from 'react';

export type Capability = Readonly<{ href: string; text: string }>;

/** A row's place in the list, which sets when the lifted bar reaches it. */
const rowOrder = (index: number): CSSProperties & Record<'--capl-i', number> => ({
  '--capl-i': index,
});

/**
 * CapabilityPanel: what the product does, as the answer to one question
 * (D52, D53). Each row is a short centred statement linking to its module
 * page, straight on the hero with no card. From 768px a lifted bar steps down
 * the rows, in CSS only and only for a list of ten (`data-rows`); pointing at
 * or focusing a row stops it and lifts that row instead. Phones do not show
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
        <span>{question}</span>
      </p>
      <ul className="cl-capl-list" aria-labelledby={questionId} data-rows={items.length}>
        {items.map(({ href, text }, index) => (
          <li key={href} style={rowOrder(index)}>
            <a href={href} className="cl-capl-row focus-ring">
              <span className="cl-capl-text">{text}</span>
            </a>
          </li>
        ))}
        <li className="cl-capl-glide" aria-hidden />
      </ul>
    </div>
  );
}
