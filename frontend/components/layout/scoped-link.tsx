'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { useProjectHref } from '@/lib/navigation/project-destination';

type ProjectLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  projectId?: string | null;
};

/** A link whose destination is owned by the currently selected project. */
export function ProjectLink({ href, projectId, ...props }: Readonly<ProjectLinkProps>) {
  const projectHref = useProjectHref();
  return <Link href={projectHref(href, projectId)} {...props} />;
}
