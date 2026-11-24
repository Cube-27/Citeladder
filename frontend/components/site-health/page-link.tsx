import { useContext, type ComponentProps } from 'react';

import { PageOpenContext, pageHref } from '@/components/site-health/page-open-context';
import { TextLink } from '@/components/ui/text-link';

type LinkProps = Extract<
  ComponentProps<typeof TextLink>,
  { asChild?: false; variant?: 'internal' }
>;

export function PageLink({
  crawlId,
  siteUrlId,
  ...props
}: Omit<LinkProps, 'href' | 'onClick' | 'variant' | 'asChild' | 'projectId'> &
  Readonly<{ crawlId: string; siteUrlId: string }>) {
  const openPage = useContext(PageOpenContext);
  return (
    <TextLink
      {...props}
      href={pageHref({ crawlId, siteUrlId })}
      aria-haspopup={openPage ? 'dialog' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (!openPage || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        openPage({ crawlId, siteUrlId });
      }}
    />
  );
}
