import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { isFlowPath } from '@/lib/navigation/app-routes';

import { ShellFallback } from './shell-fallback';

/**
 * What is drawn before the page: the one owner (PRs 524, 551). A shell route
 * gets the shell's frame with the page's skeleton; a flow route (sign-in,
 * setup, the chooser, an invitation) gets its plain ground and nothing else,
 * because a sidebar or a loading card there is a screen that never comes.
 * `index.html`'s boot frame makes the same choice from the same manifest flag.
 * `children` replace the skeleton (an error, a notice).
 */
export function FirstFrame({ children }: Readonly<{ children?: ReactNode }>) {
  const { pathname } = useLocation();
  if (!isFlowPath(pathname ?? '')) return <ShellFallback>{children}</ShellFallback>;
  return (
    <div data-flow-frame="" className="bg-ground text-ink min-h-dvh antialiased">
      {children === undefined ? null : (
        <main
          id="main"
          className="max-w-flow mx-auto w-full px-[var(--content-gutter)] pt-[var(--flow-gap)]"
        >
          {children}
        </main>
      )}
    </div>
  );
}

/**
 * True while a workspace gate (access, Terms) has no answer for the selected
 * workspace. The gates keep the tree mounted and raise this instead of
 * swapping in a frame, so a workspace switch never rebuilds the shell; the
 * content slot below shows its loading frame until it drops.
 */
const GateHoldContext = createContext(false);

export function GateHold({ held, children }: Readonly<{ held: boolean; children: ReactNode }>) {
  const outer = useContext(GateHoldContext);
  return <GateHoldContext.Provider value={outer || held}>{children}</GateHoldContext.Provider>;
}

/** A content slot: `frame` while a gate holds, product content once every gate has answered. */
export function HeldContent({
  frame,
  children,
}: Readonly<{ frame: ReactNode; children: ReactNode }>) {
  return useContext(GateHoldContext) ? frame : children;
}
