'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type Bounds = { min: number; max: number };

/** Pointer and keyboard mechanics shared by the Commerce and Prompts splitters. */
export function usePaneResizeInteraction({
  width,
  bounds,
  onResize,
  onCommit,
  defaultWidth,
  homeWidth,
  endKey = false,
  shiftStep = 16,
  onBoundsChange,
}: {
  width: number;
  bounds: () => Bounds;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  defaultWidth: number;
  homeWidth: number;
  endKey?: boolean;
  shiftStep?: number;
  onBoundsChange?: (bounds: Bounds) => void;
}) {
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);
  const dragRef = useRef<{ pointerId?: number; startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const apply = (next: number) => {
    const limits = bounds();
    onBoundsChange?.(limits);
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(next)));
    widthRef.current = clamped;
    onResize(clamped);
    return clamped;
  };

  const restoreDocument = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => restoreDocument, []);

  const beginDrag = (clientX: number, pointerId?: number) => {
    dragRef.current = { pointerId, startX: clientX, startWidth: widthRef.current };
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const dragTo = (clientX: number, pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    apply(drag.startWidth + clientX - drag.startX);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    onCommit(widthRef.current);
    restoreDocument();
  };
  const nudge = (delta: number) => onCommit(apply(widthRef.current + delta));
  const reset = () => onCommit(apply(defaultWidth));
  const refreshBounds = () => apply(widthRef.current);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginDrag(event.clientX, event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) =>
    dragTo(event.clientX, event.pointerId);
  const finishPointer = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const handle = event.currentTarget;
    if (handle.hasPointerCapture?.(event.pointerId))
      handle.releasePointerCapture?.(event.pointerId);
    endDrag();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? shiftStep : 16;
    if (event.key === 'ArrowLeft') nudge(-step);
    else if (event.key === 'ArrowRight') nudge(step);
    else if (event.key === 'Home') onCommit(apply(homeWidth));
    else if (event.key === 'End' && endKey) onCommit(apply(bounds().max));
    else return;
    event.preventDefault();
  };

  return {
    dragging,
    beginDrag,
    dragTo,
    endDrag,
    nudge,
    reset,
    refreshBounds,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: finishPointer,
    onLostPointerCapture: endDrag,
    onDoubleClick: reset,
    onKeyDown,
  };
}
