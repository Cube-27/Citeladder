import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';

import { LINK_LOOK, type LinkLook } from '@/components/ui/link-look';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { isAppRoute } from '@/lib/navigation/app-route';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { cn } from '@/lib/utils';

type ProjectLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  href: string;
  projectId?: string | null;
  tone?: TextTone;
  look?: LinkLook;
};

export function ProjectLink({
  href,
  projectId,
  tone,
  look = 'plain',
  className,
  ...props
}: Readonly<ProjectLinkProps>) {
  const projectHref = useProjectHref();
  const classes = cn(LINK_LOOK[look], tone && TEXT_TONE_CLASS[tone], className);
  if (!isAppRoute(href)) return <span className={classes}>{props.children}</span>;
  return <Link to={projectHref(href, projectId)} {...props} className={classes} />;
}
