import { DIAGNOSE_PAGES } from './platform-pages-diagnose';
import { IMPROVE_PAGES } from './platform-pages-improve';
import { MEASURE_PAGES } from './platform-pages-measure';
import { OUTCOME_PAGES } from './platform-pages-outcomes';
import type { PlatformPage } from './platform-page-types';

export type { PlatformCta, PlatformPage, PlatformScreen } from './platform-page-types';

export const PLATFORM_PAGES: readonly PlatformPage[] = [
  ...MEASURE_PAGES,
  ...OUTCOME_PAGES,
  ...DIAGNOSE_PAGES,
  ...IMPROVE_PAGES,
];
