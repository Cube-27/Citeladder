import {
  Children,
  createContext,
  Fragment,
  isValidElement,
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
import { BusyRung } from '@/components/ui/rung-meter';
import { textRoleClass } from '@/components/ui/text-role';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import './section.css';

export type SurfaceDepth = 'page' | 'surface';

export const SurfaceContext = createContext<SurfaceDepth>('page');

export const useOnPage = () => useContext(SurfaceContext) === 'page';

type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'className' | 'style'> & {
  accent?: boolean;
  tray?: boolean;
};

type Tray = 'open' | 'head-only' | undefined;

function shownChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [child];
    if (child.type === Fragment) return shownChildren(child.props.children);
    return child.type === BusyRung ? [] : [child];
  });
}

function opensWithHead(children: ReactNode): Tray {
  const shown = shownChildren(children);
  const [first] = shown;
  if (!isValidElement<{ children?: ReactNode }>(first)) return undefined;
  if (first.type === SectionHeader) return shown.length === 1 ? 'head-only' : 'open';
  if (shown.length > 1) return undefined;
  if (first.type === Section && opensWithHead(first.props.children)) return 'open';
  return undefined;
}

function trayOf(children: ReactNode, tray: boolean | undefined): Tray {
  if (tray === undefined) return opensWithHead(children);
  return tray ? 'open' : undefined;
}

export function Section({ children, accent = false, tray, ...props }: Readonly<SectionProps>) {
  const onPage = useOnPage();
  const shape = onPage ? trayOf(children, tray) : undefined;
  return (
    <section
      {...props}
      data-panel={onPage ? 'card' : 'flat'}
      data-accent={accent ? '' : undefined}
      data-tray={shape === 'open' ? '' : shape}
    >
      <SurfaceContext value="surface">
        <StateHeadingLevelContext value={3}>{children}</StateHeadingLevelContext>
      </SurfaceContext>
    </section>
  );
}

export function SectionHeader({
  children,
  actions,
  search,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'header'>, 'className' | 'style'> & {
    actions?: ReactNode;
    search?: ReactNode;
  }
>) {
  if (!actions && !search) {
    return (
      <header {...props} data-section-heading="" className="grid min-w-0 gap-1">
        {children}
      </header>
    );
  }
  const heading = children ? (
    <div data-section-heading="" className="grid max-w-full min-w-0 shrink-0 grid-cols-1 gap-1">
      {children}
    </div>
  ) : null;
  const controls = actions ? (
    <div
      data-section-actions=""
      className={cn(
        'min-h-control-md flex max-w-full min-w-[min(100%,16rem)] grow basis-0 flex-wrap items-center justify-end gap-2',
        !search && '-my-2',
      )}
    >
      {actions}
    </div>
  ) : null;
  return (
    <header
      {...props}
      className={
        search ? 'grid min-w-0 gap-3' : 'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2'
      }
    >
      {heading}
      {search ? (
        <div data-section-search-row="" className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="rail:max-w-64 phone:basis-full min-w-0 grow basis-50">{search}</div>
          {controls}
        </div>
      ) : (
        controls
      )}
    </header>
  );
}

export function SectionTitle({
  children,
  level = 2,
  truncate = false,
  count,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'h2'>, 'className' | 'style'> & {
    level?: 2 | 3;
    truncate?: boolean;
    count?: number;
  }
>) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading
      {...props}
      className={cn(textRoleClass(useContext(SectionTitleRoleContext)), truncate && 'truncate')}
    >
      {children}
      <TitleCount count={count} />
    </Heading>
  );
}

export function TitleCount({ count }: Readonly<{ count: number | undefined }>) {
  if (count === undefined) return null;
  return (
    <>
      {' '}
      <span className="text-ink-2 tabular-nums">{formatCount(count)}</span>
    </>
  );
}

export function SectionDescription({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'p'>, 'className' | 'style'>>) {
  return (
    <p {...props} data-section-description="" className="text-body text-ink-2">
      <span>{children}</span>
    </p>
  );
}

export function SectionContent({
  children,
  fill = false,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'style'> & {
    children: ReactNode;
    fill?: boolean;
  }
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
  columns,
  as: Element = 'div',
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
    children: ReactNode;
    rows?: boolean;
    scroll?: boolean;
    columns?: number;
    as?: 'div' | 'ul' | 'ol' | 'dl' | 'form';
    noValidate?: boolean;
  }
>) {
  const bleed = (
    <Element
      {...props}
      data-bleed=""
      data-bleed-rows={rows ? '' : undefined}
      style={columns === undefined ? undefined : { '--grid-columns': columns }}
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
  Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
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
  'data-page-content'?: '';
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
      <div className="gap-section @row-wide:auto-cols-fr @row-wide:grid-flow-col grid">
        {children}
      </div>
    </div>
  );
}
