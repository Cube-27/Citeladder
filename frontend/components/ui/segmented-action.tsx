import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { tabFace } from '@/components/ui/tabs';

export function SegmentedAction({
  selected = false,
  label,
  labels,
  className,
  children,
  ...props
}: Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    selected?: boolean;
    label: string;
    labels: readonly string[];
    children?: ReactNode;
  }
>) {
  return (
    <button
      {...props}
      type="button"
      data-tab-face=""
      className={tabFace({ kind: 'segment', selected, className })}
    >
      <span className="inline-grid justify-items-center">
        {labels.map((reserved) => (
          <span key={reserved} aria-hidden="true" className="invisible col-start-1 row-start-1">
            {reserved}
          </span>
        ))}
        <span className="col-start-1 row-start-1">{label}</span>
      </span>
      {children}
    </button>
  );
}
