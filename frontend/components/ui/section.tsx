import {
  Children,
  isValidElement,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';

import { SLIP_FACE, slipClasses } from '@/components/ui/slip';
import {
  SectionTitleRoleContext,
  StateHeadingLevelContext,
} from '@/components/ui/state-heading-level';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export type SectionVariant = 'surface' | 'framed';

export const FRAMED_FACE = cn(SLIP_FACE, 'p-[var(--card-padding)]');

const SECTION_FACE: Record<SectionVariant, string> = {
  surface: '',
  framed: FRAMED_FACE,
};

export function Section({
  children,
  className,
  variant = headedVariant(children),
  ...props
}: Readonly<ComponentPropsWithoutRef<'section'> & { variant?: SectionVariant }>) {
  return (
    <section
      {...props}
      data-section={variant}
      className={cn('surface-section min-w-0', SECTION_FACE[variant], className)}
    >
      <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
    </section>
  );
}

function headedVariant(children: ReactNode): SectionVariant {
  return Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === SectionHeader,
  )
    ? 'framed'
    : 'surface';
}

export function SectionHeader({
  children,
  className,
  actions,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'header'> & {
    actions?: ReactNode;
  }
>) {
  if (!actions) {
    return (
      <header {...props} className={cn('flex flex-col gap-1 not-last:mb-4', className)}>
        {children}
      </header>
    );
  }
  return (
    <header
      {...props}
      className={cn('flex flex-wrap items-start justify-between gap-2 not-last:mb-4', className)}
    >
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
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'p'>>) {
  return (
    <p {...props} className={textRole('body', cn('text-ink-2 max-w-[72ch]', className))}>
      {children}
    </p>
  );
}

export function SectionContent({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'div'> & { children: ReactNode }>) {
  return (
    <div {...props} className={className}>
      {children}
    </div>
  );
}

export function SectionCard({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'div'> & { children: ReactNode }>) {
  return (
    <div {...props} className={slipClasses(cn('min-w-0', className))}>
      {children}
    </div>
  );
}

export function TitledSection({
  title,
  description,
  actions,
  variant = 'framed',
  children,
  className,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: SectionVariant;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <Section variant={variant} className={className}>
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
}: Readonly<{ children: ReactNode; 'aria-busy'?: boolean }>) {
  return (
    <div
      {...props}
      data-rhythm-gap="section"
      className="flex min-w-0 flex-col gap-[var(--page-section-gap)]"
    >
      {children}
    </div>
  );
}
