'use client';

import { AlertTriangle, Check, Globe, Loader2, MessageSquare, Sparkles, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DiscoveryState, SectionStatus } from '@/lib/onboarding/use-discovery';

/**
 * The discovery step's on-screen progress.
 *
 * Three rows, one per parallel call, each resolving independently — the point
 * of the animation is to make "we are doing three things for you" legible while
 * the calls are in flight.
 */
const ROWS = [
  {
    key: 'domains',
    icon: Globe,
    label: 'Your domains',
    subLabel: 'Auto-detecting web presence and brand aliases',
  },
  {
    key: 'competitors',
    icon: Users,
    label: 'Competitors',
    subLabel: 'Identifying direct category rivals in AI responses',
  },
  {
    key: 'prompts',
    icon: MessageSquare,
    label: 'Starting prompts',
    subLabel: 'Generating high-intent buyer search prompts',
  },
] as const;

function statusText(status: SectionStatus, count: number, unconfigured: boolean) {
  if (status === 'error') return unconfigured ? 'Not available' : 'Failed';
  if (status === 'done') return count === 0 ? 'Nothing found' : `${count} discovered`;
  return 'AI Searching…';
}

export function DiscoveryProgress({
  state,
  onRetry,
}: Readonly<{
  state: DiscoveryState;
  onRetry: (key: 'domains' | 'competitors' | 'prompts') => void;
}>) {
  return (
    <ul className="grid list-none gap-3.5 p-0">
      {ROWS.map((row) => {
        const section = state[row.key];
        const count = section.data.length;
        const done = section.status === 'done';
        const failed = section.status === 'error';
        const searching = section.status === 'loading' || section.status === 'idle';

        return (
          <li
            key={row.key}
            className={cn(
              'relative overflow-hidden rounded-xl border p-4 transition-all duration-300',
              done
                ? 'border-emerald-200 bg-emerald-50/30'
                : failed
                  ? 'border-red-200 bg-red-50/30'
                  : 'border-indigo-100 bg-white',
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-300',
                  done
                    ? 'border-emerald-200 bg-emerald-100/80 text-emerald-600'
                    : failed
                      ? 'border-red-200 bg-red-100/80 text-red-600'
                      : 'border-indigo-200/80 bg-indigo-50 text-indigo-600',
                )}
              >
                <row.icon className="size-5" strokeWidth={1.75} aria-hidden />
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{row.label}</span>
                  {searching && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-3xs font-medium text-indigo-600">
                      <Sparkles className="size-2.5 animate-spin" /> AI Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{row.subLabel}</p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={cn(
                    'text-xs font-medium',
                    failed
                      ? 'text-red-600'
                      : done
                        ? 'text-emerald-700 font-semibold'
                        : 'text-indigo-600',
                  )}
                  role="status"
                >
                  {statusText(section.status, count, section.unconfigured)}
                </span>

                {failed ? (
                  <div className="flex size-6 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <AlertTriangle className="size-3.5" aria-hidden />
                  </div>
                ) : done ? (
                  <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white animate-in zoom-in-50 duration-200">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </div>
                ) : (
                  <div className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <Loader2
                      className="size-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  </div>
                )}

                {failed && !section.unconfigured ? (
                  <Button variant="ghost" size="sm" onClick={() => onRetry(row.key)}>
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
