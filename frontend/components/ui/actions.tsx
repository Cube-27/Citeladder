import type { ReactNode } from 'react';

import { Button, type ButtonProps, type ButtonVariant } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import {
  CheckCircle2,
  Copy,
  ICONS,
  Plug,
  Plus,
  Rocket,
  Sparkles,
  type IconGlyph,
} from '@/lib/icons';

type ActionPreset = Readonly<{ label: string; variant: ButtonVariant; icon?: IconGlyph }>;

export const ACTIONS = {
  launchRun: { label: 'Launch run', variant: 'primary', icon: Rocket },
  addPrompts: { label: 'Add prompts', variant: 'secondary', icon: Plus },
  askAgent: { label: 'Ask agent', variant: 'secondary', icon: ICONS.agent },
  workWithAgent: { label: 'Work with the agent', variant: 'secondary', icon: Sparkles },
  openAction: { label: 'Open Action', variant: 'secondary', icon: ICONS.opportunities },
  viewEvidence: { label: 'View evidence', variant: 'secondary' },
  markImplemented: { label: 'Mark implemented', variant: 'secondary', icon: CheckCircle2 },
  runCrawl: { label: 'Run new crawl', variant: 'secondary' },
  connectGoogle: { label: 'Connect Google', variant: 'secondary' },
  connectCrawlLogs: { label: 'Connect crawl logs', variant: 'secondary', icon: Plug },
  copy: { label: 'Copy', variant: 'secondary', icon: Copy },
  revoke: { label: 'Revoke', variant: 'danger' },
} as const satisfies Record<string, ActionPreset>;

type ActionName = keyof typeof ACTIONS;

type ActionButtonProps = Omit<ButtonProps, 'variant' | 'asChild' | 'children'> & {
  action: ActionName;
  href?: string;
  secondary?: boolean;
};

export function ActionButton({
  action,
  href,
  secondary = false,
  ...props
}: Readonly<ActionButtonProps>) {
  const named: ActionPreset = ACTIONS[action];
  const preset: ActionPreset =
    secondary && named.variant === 'primary' ? { ...named, variant: 'secondary' } : named;
  const content = (
    <>
      {preset.icon ? <Icon icon={preset.icon} /> : null}
      {preset.label}
    </>
  );
  if (href !== undefined) {
    return (
      <Button asChild variant={preset.variant} size={props.size} box={props.box}>
        <ProjectLink href={href} aria-label={props['aria-label']}>
          {content}
        </ProjectLink>
      </Button>
    );
  }
  return (
    <Button {...props} variant={preset.variant}>
      {content}
    </Button>
  );
}

export function HoverActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
      {children}
    </div>
  );
}
