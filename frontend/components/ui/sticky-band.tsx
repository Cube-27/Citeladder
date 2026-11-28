import type { ReactNode, Ref } from 'react';

export function StickyBand({
  ref,
  children,
}: Readonly<{ ref?: Ref<HTMLDivElement>; children: ReactNode }>) {
  return (
    <div
      ref={ref}
      data-page-strips=""
      className="bg-page z-sticky -mx-page-inline -my-rhythm gap-rhythm py-rhythm sticky top-[var(--masthead-block-size,var(--spacing-masthead))] flex min-w-0 flex-col"
    >
      {children}
    </div>
  );
}
