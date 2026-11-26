import type { ReactNode, Ref } from 'react';

export function StickyBand({
  ref,
  children,
}: Readonly<{ ref?: Ref<HTMLDivElement>; children: ReactNode }>) {
  return (
    <div
      ref={ref}
      data-page-strips=""
      className="bg-page z-sticky -mx-page-inline sticky top-[var(--masthead-block-size,var(--spacing-masthead))] -my-3 flex min-w-0 flex-col gap-3 py-3"
    >
      {children}
    </div>
  );
}
