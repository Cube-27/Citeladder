import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { FlowMain, PageGround } from '@/components/ui/flow-frame';
import { isFlowPath } from '@/lib/navigation/app-routes';

import { ShellFallback } from './shell-fallback';

export function FirstFrame({ children }: Readonly<{ children?: ReactNode }>) {
  const { pathname } = useLocation();
  if (!isFlowPath(pathname ?? '')) return <ShellFallback>{children}</ShellFallback>;
  return (
    <PageGround data-flow-frame="">
      {children === undefined ? null : (
        <FlowMain id="main" variant="frame">
          {children}
        </FlowMain>
      )}
    </PageGround>
  );
}

const GateHoldContext = createContext(false);

export function GateHold({ held, children }: Readonly<{ held: boolean; children: ReactNode }>) {
  const outer = useContext(GateHoldContext);
  return <GateHoldContext.Provider value={outer || held}>{children}</GateHoldContext.Provider>;
}

export function HeldContent({
  frame,
  children,
}: Readonly<{ frame: ReactNode; children: ReactNode }>) {
  return useContext(GateHoldContext) ? frame : children;
}
