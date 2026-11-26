import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import {
  SectionTitleRoleContext,
  StateHeadingLevelContext,
} from '@/components/ui/state-heading-level';
import { textRole } from '@/components/ui/typography';
import './section.css';

export type SurfaceDepth = 'page' | 'surface';

export const SurfaceContext = createContext<SurfaceDepth>('page');

export const useOnPage = () => useContext(SurfaceContext) === 'page';

type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'className'>;

export function Section({ children, ...props }: Readonly<SectionProps>) {
  const onPage = useOnPage();
  return (
    <section {...props} data-panel={onPage ? 'card' : 'flat'}>
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
      <div className="grid min-w-0 flex-1 basis-40 grid-cols-[minmax(0,1fr)] gap-1">{children}</div>
      <div className="-my-1 flex min-h-[var(--control-md)] max-w-full min-w-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    </header>
  );
}

export function SectionTitle({
  children,
  className,
  level = 2,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'> & { level?: 2 | 3 }>) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading {...props} className={textRole(useContext(SectionTitleRoleContext), className)}>
      {children}
    </Heading>
  );
}

export function SectionDescription({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'p'>, 'className'>>) {
  return (
    <p {...props} className={textRole('body', 'text-ink-2 max-w-[72ch]')}>
      {children}
    </p>
  );
}

export function SectionToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>;
}

export function SectionContent({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'div'>, 'className'> & { children: ReactNode }>) {
  return (
    <div {...props} className="min-w-0">
      {children}
    </div>
  );
}

export function SectionBleed({
  children,
  rows = false,
  as: Element = 'div',
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className'> & {
    children: ReactNode;
    rows?: boolean;
    as?: 'div' | 'ul' | 'ol';
  }
>) {
  const bleed = (
    <Element
      {...props}
      data-bleed=""
      data-bleed-rows={rows ? '' : undefined}
      className={rows ? 'divide-rule grid divide-y' : undefined}
    >
      {children}
    </Element>
  );
  return useOnPage() ? <Section>{bleed}</Section> : bleed;
}

export function SectionFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SectionBleed>
      <div className="flex min-h-10 min-w-0 flex-wrap items-center justify-end gap-2 px-[var(--panel-inset)] py-1">
        {children}
      </div>
    </SectionBleed>
  );
}

export function SectionCard({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'section'>, 'className'> & { children: ReactNode }>) {
  return <Section {...props}>{children}</Section>;
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
  ...props
}: Readonly<{ children: ReactNode; 'aria-busy'?: boolean; 'data-testid'?: string }>) {
  return (
    <div {...props} className="flex min-w-0 flex-col gap-[var(--page-section-gap)]">
      {children}
    </div>
  );
}
