import type { ComponentPropsWithRef } from 'react';

import { LINK_LOOK, type LinkLook } from '@/components/ui/link-look';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';
import { cn } from '@/lib/utils';

type ExternalHttpLinkProps = Omit<ComponentPropsWithRef<'a'>, 'href' | 'target' | 'rel'> & {
  href: string | null | undefined;
  tone?: TextTone;
  truncate?: boolean;
  look?: LinkLook;
};

export function ExternalHttpLink({
  href,
  tone,
  truncate = false,
  look = 'plain',
  children,
  ...anchorProps
}: Readonly<ExternalHttpLinkProps>) {
  const url = parseAbsoluteHttpUrl(href);
  if (!url) {
    const { className, title } = anchorProps;
    return (
      <span
        className={cn(
          LINK_LOOK[look],
          tone && TEXT_TONE_CLASS[tone],
          truncate && 'truncate',
          className,
          'no-underline',
        )}
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
      className={cn(
        'underline underline-offset-2 [:root:not([data-public-surface])_&]:hover:decoration-current [:root:not([data-public-surface])_&]:focus-visible:decoration-current',
        LINK_LOOK[look],
        tone && TEXT_TONE_CLASS[tone],
        truncate && 'truncate',
        anchorProps.className,
      )}
      href={url.toString()}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
