import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The latest value, always ending on the newest, repainted after twice the
 * last repaint's duration (state update to layout effect) within `floor` and
 * `cap`: the stream's deltas are an outside clock, and this paces the repaint
 * to what a repaint costs.
 */
export function useAdaptiveThrottle<T>(
  value: T,
  { floor, cap }: { floor: number; cap: number },
): T {
  const [shown, setShown] = useState(value);
  const paintedAt = useRef(0);
  const wait = useRef(floor);
  const updatedAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (updatedAt.current === null) return;
    wait.current = Math.min(cap, Math.max(floor, 2 * (Date.now() - updatedAt.current)));
    updatedAt.current = null;
  }, [shown, floor, cap]);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        paintedAt.current = Date.now();
        updatedAt.current = paintedAt.current;
        setShown(value);
      },
      Math.max(0, paintedAt.current + wait.current - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [value]);
  return shown;
}
