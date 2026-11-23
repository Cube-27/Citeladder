import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './art.css';

export function Art({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="cl-art">
      <div className="cl-art-canvas">{children}</div>
    </div>
  );
}

export function Line({
  className,
  tone = 'soft',
}: Readonly<{ className: string; tone?: 'soft' | 'strong' | 'wash' }>) {
  return (
    <span className={cn('cl-art-line', tone !== 'soft' && `cl-art-line--${tone}`, className)} />
  );
}

export function Card({
  className,
  ghost = false,
  children,
}: Readonly<{ className?: string; ghost?: boolean; children: ReactNode }>) {
  return (
    <div className={cn('cl-art-card', ghost && 'cl-art-card--ghost', className)}>{children}</div>
  );
}

export function Pill({
  className,
  ring = false,
  children,
}: Readonly<{ className?: string; ring?: boolean; children: ReactNode }>) {
  return (
    <span className={cn('cl-art-pill', ring && 'cl-art-pill--ring', className)}>{children}</span>
  );
}

export function Chips({
  className,
  count,
  children,
}: Readonly<{ className: string; count: 2 | 4; children?: ReactNode }>) {
  const half = count / 2;
  const chip = (key: number) => (
    <span key={key} className="cl-art-chip">
      <Line className="w-full" tone={children ? 'strong' : 'soft'} />
    </span>
  );
  return (
    <div className={cn('absolute flex items-center gap-[1em]', className)}>
      {Array.from({ length: half }, (_, index) => chip(index))}
      {children}
      {Array.from({ length: half }, (_, index) => chip(half + index))}
    </div>
  );
}
