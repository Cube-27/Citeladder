import { ChevronRight } from '@/lib/icons';
import './breadcrumbs.css';

export type Crumb = Readonly<{ label: string; href?: string }>;

/**
 * Breadcrumbs: the trail above a page's H1. Every crumb but the last links
 * up; the last is the current page and says so.
 */
export function Breadcrumbs({ items }: Readonly<{ items: readonly Crumb[] }>) {
  return (
    <nav aria-label="Breadcrumb" className="cl-crumbs">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.href ?? item.label}>
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              ) : (
                <a href={item.href} className="focus-ring">
                  {item.label}
                </a>
              )}
              {!last && <ChevronRight aria-hidden className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
