import { BrandMark } from '@/components/ui/brand-mark';
import { ExternalHttpLink } from '@/components/ui/external-http-link';
import { CITATION_FACE } from '@/components/ui/link-look';
import { cn } from '@/lib/utils';

export function Citation({
  domain,
  index,
  title,
  favicon,
  href,
  own = false,
}: Readonly<{
  domain: string;
  index?: number;
  title?: string;
  favicon?: string | null;
  href?: string | null;
  own?: boolean;
}>) {
  const host = domain.replace(/^www\./, '');
  const content = (
    <>
      {index === undefined ? null : (
        <span
          className={cn(
            'inline-grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-caption tabular-nums',
            'bg-panel',
            own ? 'text-accent-text' : 'text-ink-2',
          )}
        >
          {index}
        </span>
      )}
      {favicon ? (
        <BrandMark
          name={host}
          logoUrl={favicon}
          websiteUrl={`https://${host}`}
          placement="inline"
          entity="site"
        />
      ) : null}
      <span className="whitespace-nowrap">{host}</span>
      {title ? <span className="text-ink-2 min-w-0 truncate">{title}</span> : null}
    </>
  );
  const bare = index === undefined;
  return href ? (
    <ExternalHttpLink
      href={href}
      look="citation"
      data-own={own || undefined}
      data-bare={bare || undefined}
    >
      {content}
    </ExternalHttpLink>
  ) : (
    <span data-own={own || undefined} data-bare={bare || undefined} className={CITATION_FACE}>
      {content}
    </span>
  );
}
