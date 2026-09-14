'use client';

import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';

import { useProjectHref } from '@/lib/navigation/project-destination';

type ProjectLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & {
  href: string;
  projectId?: string | null;
};

/** A link whose destination is owned by the currently selected project. */
export function ProjectLink({ href, projectId, ...props }: Readonly<ProjectLinkProps>) {
  const projectHref = useProjectHref();
  return <Link to={projectHref(href, projectId)} {...props} />;
}
