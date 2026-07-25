'use client';

import { ArrowRight, FolderOpen } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { useProjectContext } from '@/lib/project/project-context';

/**
 * Projects stat card for the dashboard — how many brands this workspace tracks,
 * and a way into managing them.
 *
 * Aimed at the agency/multi-brand case: with one project the count is not news,
 * so the card only renders when there are two or more. A "1 project" tile on a
 * single-brand dashboard would be pure decoration, and the sidebar's Projects
 * item is already there for anyone who wants it.
 *
 * The count is real workspace state from ProjectProvider, not a projection —
 * nothing here waits on a run.
 */
export function ProjectsStatCard() {
  const { projects, activeProject, isLoading } = useProjectContext();

  if (isLoading || projects.length < 2) return null;

  const activeLabel = activeProject?.brand_name || activeProject?.name || null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <FolderOpen className="text-muted size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={eyebrowClasses}>Projects</p>
          <p className="text-foreground mt-0.5 text-base">
            <span className="mono font-semibold">{projects.length}</span> tracked
            {activeLabel ? <span className="text-muted"> · {activeLabel} active</span> : null}
          </p>
        </div>
        <Link
          href="/projects"
          className="focus-ring text-accent-text inline-flex shrink-0 items-center gap-1 rounded-sm text-xs"
        >
          Manage
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
