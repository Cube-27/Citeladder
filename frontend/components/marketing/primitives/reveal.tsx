import type { ReactNode } from 'react';

/**
 * Stable content wrappers. Earlier versions swapped a server-rendered div for
 * an opacity-zero motion node after hydration, making every route visibly
 * flash. Explanatory scene motion remains; page content itself paints once.
 */
type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;

export function Reveal({ children, className }: MotionChildren) {
  return <div className={className}>{children}</div>;
}

export function StaggerGroup({ children, className }: MotionChildren) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className }: MotionChildren) {
  return <div className={className}>{children}</div>;
}
