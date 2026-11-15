import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';

type Bounds = { min: number; max: number };

const KEY_STEP = 16;
const KEY_STEP_LARGE = 48;
/** A press that moves less than this is a click, not a drag. */
const CLICK_SLOP = 3;

/**
 * Pointer and keyboard mechanics for the sidebar's resize separator.
 *
 * Keys: ← / → move 16px (Shift: 48px), Home → minimum, End → maximum.
 * A click that does not drag steps to the next preset width, wrapping to the
 * minimum (WCAG 2.5.7); a double-click restores the default. A cancelled
 * pointer restores the width the drag started from.
 */
export function usePaneResizeInteraction({
  width,
  bounds,
  onResize,
  onCommit,
  defaultWidth,
  presets,
  onBoundsChange,
}: {
  width: number;
  bounds: () => Bounds;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
  defaultWidth: number;
  /** The widths a click steps through, in ascending order. */
  presets: readonly number[];
  onBoundsChange?: (bounds: Bounds) => void;
}) {
  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);
  const dragRef = useRef<{ pointerId?: number; startX: number; startWidth: number } | null>(null);
  const movedRef = useRef(false);
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
    movedRef.current = false;
    // The drag starts from the width on screen, whoever owned it until now.
    onResize(widthRef.current);
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const dragTo = (clientX: number, pointerId?: number) => {
    const drag = dragRef.current;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return;
    if (Math.abs(clientX - drag.startX) >= CLICK_SLOP) movedRef.current = true;
    apply(drag.startWidth + clientX - drag.startX);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    onCommit(widthRef.current);
    restoreDocument();
  };
  const cancelDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    widthRef.current = drag.startWidth;
    onResize(drag.startWidth);
    setDragging(false);
    restoreDocument();
  };
  const commitAt = (next: number) => onCommit(apply(next));
  const stepPreset = () => {
    const { min, max } = bounds();
    const next = presets.find((preset) => preset > widthRef.current && preset <= max);
    commitAt(next ?? min);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginDrag(event.clientX, event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) =>
    dragTo(event.clientX, event.pointerId);
  const finishPointer = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const handle = event.currentTarget;
    endDrag();
    if (handle.hasPointerCapture?.(event.pointerId))
      handle.releasePointerCapture?.(event.pointerId);
  };
  const cancelPointer = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const handle = event.currentTarget;
    cancelDrag();
    if (handle.hasPointerCapture?.(event.pointerId))
      handle.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    if (event.key === 'ArrowLeft') commitAt(widthRef.current - step);
    else if (event.key === 'ArrowRight') commitAt(widthRef.current + step);
    else if (event.key === 'Home') commitAt(bounds().min);
    else if (event.key === 'End') commitAt(bounds().max);
    else return;
    event.preventDefault();
  };

  return {
    dragging,
    /** Re-clamp the current width to fresh bounds (the container resized). */
    refreshBounds: () => apply(widthRef.current),
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onPointerCancel: cancelPointer,
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) cancelDrag();
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (event.detail > 1 || movedRef.current) return;
      stepPreset();
    },
    onDoubleClick: () => commitAt(defaultWidth),
    onKeyDown,
  };
}
