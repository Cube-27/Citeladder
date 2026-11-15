import type { ComponentPropsWithRef } from 'react';

import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';
import { cn } from '@/lib/utils';

type ExternalHttpLinkProps = Omit<ComponentPropsWithRef<'a'>, 'href' | 'target' | 'rel'> & {
  href: string | null | undefined;
};

/**
 * Render API supplied HTTP(S) destinations as links, or readable plain text.
 * A link is underlined unless its caller styles it as something else (a
 * button face); the plain-text fallback is never underlined, whatever the
 * caller asked for, so it cannot pass for a link.
 */
export function ExternalHttpLink({
  href,
  children,
  ...anchorProps
}: Readonly<ExternalHttpLinkProps>) {
  const url = parseAbsoluteHttpUrl(href);
  if (!url) {
    const { className, title } = anchorProps;
    return (
      <span
        className={cn(className, 'no-underline')}
        title={title}
        aria-label={anchorProps['aria-label']}
        aria-describedby={anchorProps['aria-describedby']}
      >
        {children}
      </span>
    );
  }
  return (
    <a
      {...anchorProps}
      className={cn('underline underline-offset-2', anchorProps.className)}
      href={url.toString()}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
