import type { ReactNode } from 'react';

export function QuoteGrid({
  heads,
  label,
  children,
}: Readonly<{ heads: readonly string[]; label: string; children: ReactNode }>) {
  return (
    <div className="min-w-192 whitespace-normal">
      <div
        aria-hidden
        className="text-caption text-ink-2 grid grid-cols-[minmax(144px,192px)_minmax(256px,1fr)_96px_64px_minmax(144px,224px)] gap-x-4 py-2"
      >
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
    <li className="border-rule grid grid-cols-[minmax(144px,192px)_minmax(256px,1fr)_96px_64px_minmax(144px,224px)] items-start gap-x-4 border-t py-3">
      {children}
    </li>
  );
}
