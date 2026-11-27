import type { ReactNode } from 'react';

export function QuoteGrid({
  heads,
  label,
  children,
}: Readonly<{ heads: readonly string[]; label: string; children: ReactNode }>) {
  return (
    <div className="min-w-quote-grid whitespace-normal">
      <div aria-hidden className="grid-cols-quotes text-caption text-ink-2 grid gap-x-4 py-2">
        {heads.map((head) => (
          <span key={head}>{head}</span>
        ))}
      </div>
      <ul aria-label={label}>{children}</ul>
    </div>
  );
}

export function QuoteGridRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <li className="grid-cols-quotes border-rule grid items-start gap-x-4 border-t py-3">
      {children}
    </li>
  );
}
