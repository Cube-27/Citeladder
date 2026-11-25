import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const PageTabEndContext = createContext<HTMLElement | null>(null);

export const PageFilterBandContext = createContext(false);

export function PageTabEnd({
  children,
  fallback = children,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) {
  const slot = useContext(PageTabEndContext);
  return slot ? createPortal(children, slot) : fallback;
}
