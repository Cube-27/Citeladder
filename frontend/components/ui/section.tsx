import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import {
  SectionTitleRoleContext,
  StateHeadingLevelContext,
} from '@/components/ui/state-heading-level';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import './section.css';

export type SurfaceDepth = 'page' | 'surface';

export const SurfaceContext = createContext<SurfaceDepth>('page');

export const useOnPage = () => useContext(SurfaceContext) === 'page';

type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'className'> & { accent?: boolean };

export function Section({ children, accent = false, ...props }: Readonly<SectionProps>) {
  const onPage = useOnPage();
  return (
    <section {...props} data-panel={onPage ? 'card' : 'flat'} data-accent={accent ? '' : undefined}>
      <SurfaceContext value="surface">
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </SurfaceContext>
    </section>
  );
}

export function SectionHeader({
  children,
  actions,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'header'>, 'className'> & { actions?: ReactNode }>) {
  if (!actions) {
    return (
      <header {...props} className="grid min-w-0 gap-1">
        {children}
      </header>
    );
  }
  return (
    <header {...props} className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="grid min-w-0 flex-1 basis-40 grid-cols-1 gap-1">{children}</div>
      <div
        data-section-actions=""
        className="min-h-control-md -my-2 flex max-w-full min-w-0 flex-wrap items-center gap-2"
      >
        {actions}
      </div>
    </header>
  );
}

export function SectionTitle({
  children,
  className,
  level = 2,
  truncate = false,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'> & { level?: 2 | 3; truncate?: boolean }>) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading
      {...props}
      className={textRole(
        useContext(SectionTitleRoleContext),
        cn(truncate && 'truncate', className),
      )}
    >
      {children}
    </Heading>
  );
}

export function SectionDescription({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'p'>, 'className'>>) {
  return (
    <p {...props} className={textRole('body', 'text-ink-2 max-w-copy')}>
      {children}
    </p>
  );
}

export function SectionToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>;
}

export function SectionContent({
  children,
  fill = false,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className'> & { children: ReactNode; fill?: boolean }
>) {
  return (
    <div
      {...props}
      data-slot-fill={fill ? '' : undefined}
      className={fill ? 'grid min-w-0 place-items-center' : 'min-w-0'}
    >
      {children}
    </div>
  );
}

export function SectionBleed({
  children,
  rows = false,
  scroll = false,
  as: Element = 'div',
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLElement>, 'className'> & {
    children: ReactNode;
    rows?: boolean;
    scroll?: boolean;
    as?: 'div' | 'ul' | 'ol' | 'dl' | 'form';
    noValidate?: boolean;
  }
>) {
  const bleed = (
    <Element
      {...props}
      data-bleed=""
      data-bleed-rows={rows ? '' : undefined}
      className={cn(
        rows && 'divide-rule grid divide-y',
        scroll && 'max-h-64 overflow-y-auto overscroll-contain',
      )}
    >
      {children}
    </Element>
  );
  return useOnPage() ? <Section>{bleed}</Section> : bleed;
}

export function PanelFrame({
  as: Element = 'div',
  children,
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLElement>, 'className'> & {
    as?: 'div' | 'section';
    children: ReactNode;
  }
>) {
  return (
    <Element {...props} data-panel-frame="" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SurfaceContext value="surface">{children}</SurfaceContext>
    </Element>
  );
}

export function SectionFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SectionBleed>
      <div className="px-panel-inset flex min-h-10 min-w-0 flex-wrap items-center justify-end gap-2 py-1">
        {children}
      </div>
    </SectionBleed>
  );
}

export function TitledSection({
  title,
  description,
  actions,
  children,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <Section>
      <SectionHeader actions={actions}>
        <SectionTitle>{title}</SectionTitle>
        {description ? <SectionDescription>{description}</SectionDescription> : null}
      </SectionHeader>
      {children}
    </Section>
  );
}

export function SectionStack({
  children,
  label,
  ...props
}: Readonly<{
  children: ReactNode;
  label?: string;
  'aria-busy'?: boolean;
  'data-testid'?: string;
}>) {
  const Element = label ? 'section' : 'div';
  return (
    <Element {...props} aria-label={label} className="gap-section flex min-w-0 flex-col">
      {children}
    </Element>
  );
}

export function CardGroup({
  title,
  description,
  id,
  children,
}: Readonly<{ title: ReactNode; description?: ReactNode; id?: string; children: ReactNode }>) {
  const titleId = useId();
  return (
    <section id={id} aria-labelledby={titleId} className="gap-card grid min-w-0 grid-cols-1">
      <SectionHeader>
        <SectionTitle id={titleId}>{title}</SectionTitle>
        {description ? <SectionDescription>{description}</SectionDescription> : null}
      </SectionHeader>
      {children}
    </section>
  );
}

export function CardRow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="@container min-w-0">
      <div className="gap-section grid @[640px]:auto-cols-fr @[640px]:grid-flow-col">
        {children}
      </div>
    </div>
  );
}
