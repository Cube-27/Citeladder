/**
 * Product-page copy for /platform and its capabilities. Published paths and
 * labels belong to nav.ts; the page records live in the measure and improve
 * modules, and their shared shape in platform-page-types.ts.
 */
import { IMPROVE_PAGES } from './platform-pages-improve';
import { MEASURE_PAGES } from './platform-pages-measure';
import type { PlatformPage } from './platform-page-types';

export type { PlatformCta, PlatformPage, PlatformVisual } from './platform-page-types';

export const PLATFORM_PAGES: readonly PlatformPage[] = [...MEASURE_PAGES, ...IMPROVE_PAGES];
