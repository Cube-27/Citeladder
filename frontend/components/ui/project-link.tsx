import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';

import { toneClass, type TextTone } from '@/components/ui/typography';
import { isAppRoute } from '@/lib/navigation/app-route';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { cn } from '@/lib/utils';

type ProjectLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  href: string;
  projectId?: string | null;
  tone?: TextTone;
  look?: 'plain' | 'row-title';
};

const LOOK = {
  plain: undefined,
  'row-title':
    'focus-ring-inset text-label text-ink self-start no-underline before:absolute before:inset-0',
} as const;

export function ProjectLink({
  href,
  projectId,
  tone,
  look = 'plain',
  className,
  ...props
}: Readonly<ProjectLinkProps>) {
  const projectHref = useProjectHref();
  const classes = cn(LOOK[look], toneClass(tone), className);
  if (!isAppRoute(href)) return <span className={classes}>{props.children}</span>;
  return <Link to={projectHref(href, projectId)} {...props} className={classes} />;
}
