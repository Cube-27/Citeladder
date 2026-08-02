import type { ElementType } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TourStepItem {
  id: string;
  label: string;
  icon: ElementType;
}

/**
 * Shared tour stepper component rendered in ProductWindow.
 */
export function TourStepper({
  steps,
  activeStep,
  isPlaying,
  onSelectStep,
  onTogglePlay,
  className,
  compact = false,
}: Readonly<{
  steps: readonly TourStepItem[];
  activeStep: number;
  isPlaying: boolean;
  onSelectStep: (index: number) => void;
  onTogglePlay: () => void;
  className?: string;
  compact?: boolean;
}>) {
  return (
    <div
      className={cn(
        'gap-mkt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="gap-mkt-6 sm:gap-mkt-10 grid grid-cols-2 sm:flex sm:items-center">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === activeStep;
          return (
            <button
              key={step.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectStep(idx)}
              className={cn(
                'text-mkt-xs gap-mkt-10 rounded-mkt-lg px-mkt-14 py-mkt-10 flex items-center text-left font-semibold transition-colors',
                compact && 'gap-mkt-6 rounded-mkt-sm px-mkt-14 py-mkt-6',
                isActive
                  ? 'bg-mkt-indigo text-white'
                  : 'bg-mkt-surface text-mkt-ink-soft hover:text-mkt-ink',
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  'size-4 shrink-0',
                  compact && 'size-3',
                  isActive ? 'text-white' : 'text-mkt-indigo',
                )}
              />
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </div>

      <div className="border-mkt-black-10 gap-mkt-10 pt-mkt-6 flex items-center justify-between border-t sm:justify-end sm:border-t-0 sm:pt-0">
        <span className="text-mkt-xs text-mkt-ink-soft font-mono font-medium">
          {activeStep + 1} / {steps.length}
        </span>
        <button
          type="button"
          onClick={onTogglePlay}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause story tour' : 'Play story tour'}
          className="border-mkt-black-10 text-mkt-ink-soft bg-mkt-surface hover:text-mkt-ink rounded-mkt-sm p-mkt-6 border"
          title={isPlaying ? 'Pause story tour' : 'Play story tour'}
        >
          {isPlaying ? (
            <Pause className="size-3" aria-hidden />
          ) : (
            <Play className="size-3" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
