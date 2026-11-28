import { useLayoutEffect, type ReactNode, type RefObject } from 'react';

import { LiveVerb, SkeletonBlock } from '@/components/ui/skeleton-block';
import { StateBlock, type StateBlockProps } from '@/components/ui/state-block';
import { TableBody, TableCell } from '@/components/ui/table';

export type DataTableState = Exclude<StateBlockProps, { inline: true }>;

export type DataTableInlineEmpty = Extract<StateBlockProps, { inline: true }>;

export function DataTableBody({
  cells,
  colSpan,
  state,
  pageSize,
  children,
}: Readonly<{
  cells: number;
  colSpan: number;
  state?: DataTableState | DataTableInlineEmpty;
  pageSize?: number;
  children?: ReactNode;
}>) {
  if (state?.kind === 'loading') {
    return (
      <LoadingBody
        columns={cells}
        label={state.label ?? 'Loading…'}
        rows={pageSize ?? LOADING_ROWS}
      />
    );
  }
  if (state) {
    return (
      <TableBody>
        <tr data-table-state="">
          <TableCell colSpan={colSpan} alignTop>
            <InFrame>
              <StateBlock {...state} />
            </InFrame>
          </TableCell>
        </tr>
      </TableBody>
    );
  }
  return <TableBody>{children}</TableBody>;
}

function LoadingBody({
  columns,
  label,
  rows,
}: Readonly<{ columns: number; label: string; rows: number }>) {
  const cells = Array.from({ length: columns }, (_, index) => index);
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <tr
          key={row}
          aria-hidden={row === 0 ? undefined : true}
          data-table-loading=""
          className="h-row"
        >
          {cells.map((cell) => (
            <td key={cell} className="px-cell-x">
              {row === 0 && cell === 0 ? <LiveVerb label={label} /> : null}
              <SkeletonBlock width="3/4" />
            </td>
          ))}
        </tr>
      ))}
    </TableBody>
  );
}

function InFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="start-panel-inset sticky w-[calc(100cqi_-_2_*_var(--spacing-panel-inset))]">
      {children}
    </div>
  );
}

const LOADING_ROWS = 5;

export function usePinnedPadding(ref: RefObject<HTMLElement | null>, pinned: number) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || pinned === 0 || typeof ResizeObserver === 'undefined') return;
    const heads = [...node.querySelectorAll(':scope > table > thead > tr > *')].slice(0, pinned);
    const update = () => {
      const width = heads.reduce((sum, head) => sum + head.getBoundingClientRect().width, 0);
      node.style.scrollPaddingInlineStart = `${width}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    for (const head of heads) observer.observe(head);
    return () => observer.disconnect();
  }, [ref, pinned]);
}
