'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * 404 for the authed area.
 *
 * Renders inside the AppShell content column on the shared EmptyState
 * pattern — themed in both modes, with a single way back to the default
 * route — instead of the unbranded Next.js fallback.
 *
 * Client component: its graph includes Button → @radix-ui/react-slot, which
 * calls `createContext` at module scope and therefore cannot evaluate in the
 * RSC module graph (prerender would fail with `createContext is not a
 * function`).
 */
export default function AppNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      heading="Page not found"
      description="The page you are looking for does not exist or may have moved."
      action={
        <Button asChild>
          <Link href="/visibility">Back to overview</Link>
        </Button>
      }
    />
  );
}
