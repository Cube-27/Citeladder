/**
 * What the product tour IS — its version, its steps, and the two pure questions
 * asked about them.
 *
 * Kept apart from both the provider and the runner because the provider must be
 * able to read the catalog without pulling driver.js in behind it, which is the
 * whole reason the runner is a separate lazy module.
 */
export const TOUR_VERSION = 'dashboard-v1';

export type TourStep = {
  id: string;
  path: string;
  selector: string;
  title: string;
  description: string;
  /** Which selection owns the destination. Project is the default. */
  scope?: 'project' | 'workspace';
  /** Preferred popover placement relative to the highlighted target. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
};

/** Versioned, route-aware catalog. Targets are stable `data-tour` hooks, never CSS layout classes. */
export const PRODUCT_TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard-overview',
    path: '/projects',
    selector: '[data-tour="dashboard-overview"]',
    title: 'Your Dashboard',
    description: 'Your active project at a glance — every card links to its evidence.',
    side: 'bottom',
    align: 'start',
  },
  {
    id: 'dashboard-report',
    path: '/projects',
    selector: '[data-tour="dashboard-report"]',
    title: 'Share an executive report',
    description: 'Download a PDF built from persisted results — never a live provider call.',
    side: 'bottom',
    align: 'end',
  },
  {
    id: 'provider-settings',
    path: '/settings?tab=providers',
    scope: 'workspace',
    selector: '[data-tour="provider-settings"]',
    title: 'Connect answer engines',
    description: 'Add provider keys before launching an audit. Keys are write-only.',
    side: 'top',
    align: 'center',
  },
] as const;

export function stepAt(id: string | null | undefined) {
  return PRODUCT_TOUR_STEPS.find((step) => step.id === id) ?? PRODUCT_TOUR_STEPS[0];
}

/**
 * Is the reader already where this step lives?
 *
 * Only the parameters the STEP names are compared. The shell owns `?project=`
 * and `?workspace=` and writes them into the address itself, so demanding an
 * exact query match meant the tour pushed the bare path, the shell replaced it
 * with the scoped one, and the two navigated against each other forever.
 */
export function isCurrentStepLocation(pathname: string, search: string, stepPath: string) {
  const expected = new URL(stepPath, 'https://citeladder.local');
  if (pathname !== expected.pathname) return false;
  const current = new URLSearchParams(search);
  return [...expected.searchParams].every(([key, value]) => current.get(key) === value);
}
