import { ENGINE_PATHS } from '@/components/ui/engine-mark';
import { cn } from '@/lib/utils';

export type OfficialEngineKey = 'openai' | 'claude' | 'gemini' | 'google';

/** The website's engine marks until PR 6 moves its scenes onto `EngineMark`. */
export function EngineLogo({
  engine,
  className,
}: Readonly<{ engine: OfficialEngineKey; className?: string }>) {
  return (
    <svg
      aria-hidden
      data-engine-logo={engine}
      viewBox="0 0 24 24"
      fillRule="evenodd"
      className={cn('fill-current', className)}
    >
      <path d={ENGINE_PATHS[engine === 'openai' ? 'chatgpt' : engine]} />
    </svg>
  );
}
