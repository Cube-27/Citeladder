import { createContext } from 'react';
import { sitePagePath } from '@citeladder/contracts/record-kinds';

export type PageTarget = Readonly<{ crawlId: string; siteUrlId: string; rerun?: boolean }>;

export const PageOpenContext = createContext<((target: PageTarget) => void) | null>(null);

export const pageHref = ({ crawlId, siteUrlId }: PageTarget) => sitePagePath(crawlId, siteUrlId);

export function linkedPage(raw: string | null): PageTarget | null {
  const [crawlId, siteUrlId, ...rest] = raw?.split('_') ?? [];
  return crawlId && siteUrlId && rest.length === 0 ? { crawlId, siteUrlId } : null;
}
