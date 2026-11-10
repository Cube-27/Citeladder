'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Slot = Readonly<{
  element: HTMLElement | null;
  setElement: (node: HTMLElement | null) => void;
}>;

const SourceControlsContext = createContext<Slot | null>(null);

/**
 * Where the Sources table's filters (domain, type, standing) draw: in the
 * page's control strip with the run, surface and period filters, not in the
 * table's own toolbar, which keeps only search and export.
 *
 * The filters stay owned by the Sources panel, which holds the page size and
 * the read their options come from; the strip only gives them a place. The
 * provider spans both the strip and the panel.
 */
export function SourceControlsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const slot = useMemo(() => ({ element, setElement }), [element]);
  return <SourceControlsContext.Provider value={slot}>{children}</SourceControlsContext.Provider>;
}

/** The place in the control strip the Sources filters draw into. */
export function SourceControlsTarget() {
  const slot = useContext(SourceControlsContext);
  return <div className="contents" data-testid="source-controls" ref={slot?.setElement} />;
}

/**
 * Whether a control strip hosts the Sources filters. A panel rendered outside
 * the provider (on its own) has none, and keeps its filters in its toolbar.
 */
export function useHasSourceControlsStrip(): boolean {
  return useContext(SourceControlsContext) !== null;
}

/** Draws the Sources filters in the control strip, once the strip has mounted. */
export function SourceControls({ children }: Readonly<{ children: ReactNode }>) {
  const element = useContext(SourceControlsContext)?.element;
  return element ? createPortal(children, element) : null;
}
