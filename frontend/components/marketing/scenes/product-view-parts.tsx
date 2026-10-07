import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Gauge,
  LayoutGrid,
  Link2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { EngineLogo } from '../primitives/engine-logo';

/** Shared chrome for the coded product views: marks, pills, panel heads and frames. */

export function Favicon({ letter, tone = 'neutral' }: Readonly<{ letter: string; tone?: string }>) {
  return (
    <span className="pv-favicon" data-tone={tone} aria-hidden>
      {letter}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: Readonly<{ children: ReactNode; tone?: string }>) {
  return (
    <span className="pv-pill" data-tone={tone}>
      {children}
    </span>
  );
}

export function PanelHead({ title, meta }: Readonly<{ title: string; meta?: ReactNode }>) {
  return (
    <div className="pv-panel-head">
      <span className="pv-panel-title">{title}</span>
      {meta && <span className="pv-meta">{meta}</span>}
    </div>
  );
}

const SIDEBAR = [
  ['Overview', LayoutGrid],
  ['AI Visibility', BarChart3],
  ['Sources', Link2],
  ['Site Health', Gauge],
  ['Demand', TrendingUp],
  ['Agent', Sparkles],
] as const;

export type ShellSection = (typeof SIDEBAR)[number][0];

/** The product's own chrome — workspace rail plus a titled pane. */

export function AppShellFrame({
  active,
  title,
  subtitle,
  children,
}: Readonly<{ active: ShellSection; title: string; subtitle: string; children: ReactNode }>) {
  return (
    <div className="product-frame pv-shell app-type-scale">
      <aside className="pv-sidebar" aria-hidden>
        <span className="pv-workspace">
          <Favicon letter="Z" tone="owned" />
          Zernovelle
        </span>
        {SIDEBAR.map(([label, Icon]) => (
          <span key={label} className="pv-nav" data-active={label === active || undefined}>
            <Icon className="size-3.5" />
            {label}
          </span>
        ))}
      </aside>
      <div className="pv-main">
        <div className="pv-main-head">
          <div>
            <p className="pv-main-title">{title}</p>
            <p className="pv-meta">{subtitle}</p>
          </div>
          <span className="pv-engines" aria-hidden>
            <EngineLogo engine="openai" className="size-3.5" />
            <EngineLogo engine="gemini" className="size-3.5" />
            <EngineLogo engine="claude" className="size-3.5" />
            <EngineLogo engine="google" className="size-3.5" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A single product view in a titled window, on the public stage. */

export function ProductShot({
  title,
  children,
  caption = 'Illustrative example with synthetic data.',
  className,
}: Readonly<{ title: string; children: ReactNode; caption?: string; className?: string }>) {
  return (
    <figure className={cn('min-w-0', className)}>
      <div className="product-stage p-4 sm:p-8 lg:p-10">
        <div className="product-frame app-type-scale">
          <div className="product-frame-bar">
            <span className="inline-flex items-center gap-2">
              <span className="pv-window-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {title}
            </span>
            <ArrowUpRight className="size-3.5 opacity-50" aria-hidden />
          </div>
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </div>
      <figcaption className="product-caption mt-3">{caption}</figcaption>
    </figure>
  );
}
