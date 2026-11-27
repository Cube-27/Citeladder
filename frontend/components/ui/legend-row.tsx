import type { ReactNode } from 'react';

export function LegendRow({ children, end }: Readonly<{ children: ReactNode; end?: ReactNode }>) {
  return (
    <legend className="text-label text-ink flex w-full justify-between gap-2 pb-1">
      {children}
      {end}
    </legend>
  );
}
