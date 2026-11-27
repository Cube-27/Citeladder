import { ChevronRight } from '@/lib/icons';
import './breadcrumbs.css';
import { Icon } from '@/components/ui/icon';

export type Crumb = Readonly<{ label: string; href?: string }>;

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
              {!last && <Icon icon={ChevronRight} size="flush" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
