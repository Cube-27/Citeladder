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
};

export function ProjectLink({
  href,
  projectId,
  tone,
  className,
  ...props
}: Readonly<ProjectLinkProps>) {
  const projectHref = useProjectHref();
  const classes = cn(toneClass(tone), className);
  if (!isAppRoute(href)) return <span className={classes}>{props.children}</span>;
  return <Link to={projectHref(href, projectId)} {...props} className={classes} />;
}
