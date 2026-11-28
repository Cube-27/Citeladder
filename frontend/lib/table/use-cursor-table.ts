import { useCallback, useState } from 'react';

import { TABLE_PAGE_SIZE_OPTIONS } from '@/lib/config/tables';

export function useCursorTable(
  scopeKey: string,
  sizes: readonly [number, ...number[]] = TABLE_PAGE_SIZE_OPTIONS,
) {
  const [stack, setStack] = useState<readonly string[]>([]);
  const [pageSizeState, setPageSizeState] = useState(sizes[0]);
  const [stackScope, setStackScope] = useState(scopeKey);
  if (stackScope !== scopeKey) {
    setStackScope(scopeKey);
    if (stack.length) setStack([]);
  }

  const cursor = stack.at(-1);
  const canPrev = stack.length > 0;
  const page = stack.length + 1;

  const push = useCallback((nextCursor: string | null) => {
    if (!nextCursor) return;
    setStack((prev) => (prev.at(-1) === nextCursor ? prev : [...prev, nextCursor]));
  }, []);

  const pop = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);

  const setPageSize = useCallback(
    (value: number) => {
      setPageSizeState(sizes.includes(value) ? value : sizes[0]);
      setStack([]);
    },
    [sizes],
  );

  return { cursor, canPrev, page, pageSize: pageSizeState, push, pop, reset, setPageSize };
}

export function cursorControls(
  pager: Pick<ReturnType<typeof useCursorTable>, 'canPrev' | 'pop' | 'push'>,
  nextCursor: string | null | undefined,
) {
  return {
    canPrev: pager.canPrev,
    canNext: Boolean(nextCursor),
    onPrev: pager.pop,
    onNext: () => pager.push(nextCursor ?? null),
  };
}

export function pageRange(page: number, pageSize: number, rowCount: number) {
  if (rowCount === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: from + rowCount - 1 };
}
