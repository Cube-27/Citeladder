import { lazy, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { pageSection } from '@/components/layout/nav-items';
import { PageTitleContext } from '@/components/layout/page-title-context';
import { ShellContext } from '@/components/layout/shell-context';
import { NavMenuButton } from '@/components/ui/app-shell';
import type { Crumb } from '@/components/ui/breadcrumb';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { LazyIsland } from '@/components/ui/lazy-island';
import { Masthead, usePublishedHeight } from '@/components/ui/masthead';
import {
  MastheadOverflow,
  MastheadPrimarySlot,
  PageEmptyOfferProvider,
} from '@/components/ui/masthead-actions';
import { PageFilterBandContext, PageTabEndContext } from '@/components/templates/page-tab-end';
import { Inline } from '@/components/ui/layout';
import {
  PageBody,
  PageFilterBand,
  PageHeadingRow,
  PageTabBand,
  PageTitle,
  PageWidthFrame,
  type PageWidth,
} from '@/components/ui/page-chrome';
import { StickyBand } from '@/components/ui/sticky-band';
import { resolveTitle, routeWidth } from '@/lib/navigation/app-routes';
import { useUrlSearch } from '@/lib/navigation/url-params';
import { useMediaQuery } from '@/lib/use-media-query';
import { routeTrail } from '@/lib/navigation/route-trail';

const Breadcrumb = lazy(() =>
  import('@/components/ui/breadcrumb').then(({ Breadcrumb }) => ({ default: Breadcrumb })),
);

const NARROW_QUERY = '(max-width: 899px)';

export type PageFrameSlots = Readonly<{
  title?: string;
  trail?: readonly Crumb[];
  crumb?: Pick<Crumb, 'label' | 'mark'>;
  actions?: ReactNode;
  tabs?: ReactNode;
  filters?: FilterBarProps;
}>;

export function PageFrame({
  title,
  trail,
  crumb,
  actions,
  tabs,
  filters,
  fill,
  head = 'page',
  end = 'page',
  children,
}: PageFrameSlots &
  Readonly<{
    fill?: true;
    head?: 'page' | 'masthead';
    end?: 'page' | 'thread';
    children: ReactNode;
  }>) {
  const { pathname, resolved, parents, width, headed, narrow } = usePageLayout({
    title,
    trail,
    fill,
    head,
  });
  const strips = Boolean(tabs || filters);
  const [tabEnd, setTabEnd] = useState<HTMLElement | null>(null);
  return (
    <PageEmptyOfferProvider>
      <PageTabEndContext value={tabEnd}>
        <PageWidthFrame width={width}>
          <PageMasthead
            pathname={pathname}
            title={resolved}
            parents={parents}
            crumb={crumb}
            heading={!headed}
            actions={head === 'masthead' || narrow ? actions : undefined}
          />
          {headed ? (
            <PageHeading
              title={resolved}
              narrow={narrow}
              actions={head === 'page' ? actions : undefined}
              strips={strips}
              width={width}
            />
          ) : null}
          {strips ? <PageStrips tabs={tabs} filters={filters} onTabEnd={setTabEnd} /> : null}
          <PageBody width={width} end={end}>
            {children}
          </PageBody>
        </PageWidthFrame>
      </PageTabEndContext>
    </PageEmptyOfferProvider>
  );
}

function PageMasthead({
  pathname,
  title,
  parents,
  crumb,
  heading,
  actions,
}: Readonly<{
  pathname: string;
  title: string;
  parents: readonly Crumb[];
  crumb: PageFrameSlots['crumb'];
  heading: boolean;
  actions: ReactNode;
}>) {
  const shell = useContext(ShellContext);
  const navDrawer = shell?.navDrawer;
  const searchParams = useUrlSearch();
  return (
    <Masthead
      title={title}
      section={mastheadSection(pageSection(pathname, searchParams), parents[0]?.label ?? title)}
      crumb={
        parents.length > 0 ? (
          <LazyIsland failed={null} label="breadcrumb" defects="contain">
            <Breadcrumb parts={[...parents, crumb ?? { label: title }]} />
          </LazyIsland>
        ) : null
      }
      lead={
        navDrawer ? <NavMenuButton expanded={navDrawer.open} onOpen={navDrawer.onOpen} /> : null
      }
      search={shell?.searchTrigger}
      heading={heading}
      actions={actions}
      end={shell?.agentTrigger}
    />
  );
}

function usePageLayout({
  title,
  trail,
  fill,
  head,
}: Readonly<{
  title: string | undefined;
  trail: readonly Crumb[] | undefined;
  fill: true | undefined;
  head: 'page' | 'masthead';
}>) {
  const pathname = useLocation().pathname ?? '';
  const resolved = useRouteTitle(title, pathname);
  const parents = trail ?? routeTrail(pathname);
  const width: PageWidth = fill ? 'fill' : routeWidth(pathname);
  const narrow = useMediaQuery(NARROW_QUERY);
  return {
    pathname,
    resolved,
    parents,
    width,
    narrow,
    headed: head === 'page' || parents.length > 0,
  };
}

function PageHeading({
  title,
  narrow,
  actions,
  strips,
  width,
}: Readonly<{
  title: string;
  narrow: boolean;
  actions?: ReactNode;
  strips: boolean;
  width: PageWidth;
}>) {
  const block = useRef<HTMLDivElement>(null);
  usePublishedHeight(block, '--page-heading-block-size');
  const [primarySlot, setPrimarySlot] = useState<HTMLElement | null>(null);
  if (narrow)
    return (
      <PageHeadingRow ref={block} width={width} strips={strips}>
        <h1 className="sr-only">{title}</h1>
      </PageHeadingRow>
    );
  return (
    <PageHeadingRow ref={block} width={width} strips={strips}>
      <PageTitle>{title}</PageTitle>
      {actions === undefined ? null : (
        <Inline data-page-actions="" justify="end" wrap box="end">
          <MastheadPrimarySlot value={primarySlot}>
            <MastheadOverflow label="Page actions">{actions}</MastheadOverflow>
          </MastheadPrimarySlot>
          <span ref={setPrimarySlot} data-masthead-primary="" className="contents" />
        </Inline>
      )}
    </PageHeadingRow>
  );
}

function PageStrips({
  tabs,
  filters,
  onTabEnd,
}: Pick<PageFrameSlots, 'tabs' | 'filters'> &
  Readonly<{ onTabEnd: (slot: HTMLElement | null) => void }>) {
  const strips = useRef<HTMLDivElement>(null);
  usePublishedHeight(strips, '--strips-block-size');
  return (
    <StickyBand ref={strips}>
      {tabs ? <PageTabBand endRef={onTabEnd}>{tabs}</PageTabBand> : null}
      {filters ? (
        <PageFilterBand>
          <PageFilterBandContext value>
            <FilterBar {...filters} />
          </PageFilterBandContext>
        </PageFilterBand>
      ) : null}
    </StickyBand>
  );
}

function mastheadSection(section: Readonly<{ title: string }>, firstName: string) {
  return section.title === firstName ? null : section;
}

function useRouteTitle(title: string | undefined, pathname: string) {
  const setTitle = useContext(PageTitleContext);
  useLayoutEffect(() => {
    if (!setTitle || title === undefined) return;
    setTitle(title);
    return () => {
      setTitle((current) => (current === title ? undefined : current));
    };
  }, [setTitle, title]);
  return title ?? resolveTitle(pathname);
}
