import { useQuery } from '@tanstack/react-query';

import type { NewChatInput } from '@/components/agent/use-chat-turns';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Eye, FileText, Sparkles, TrendingUp, type IconGlyph } from '@/lib/icons';
import { actionsQueries } from '@/lib/api/actions';
import { AGENT_BRIEFING_ACTIONS } from '@/lib/config/agent';

const BRIEFING_REQUEST =
  'What should I work on this week? Brief me on the highest-value work, why each item matters with its evidence, and the first step for each.';

const QUICK_STARTS: readonly Readonly<{
  workflowId: string;
  label: string;
  icon: IconGlyph;
  message: string;
}>[] = [
  {
    workflowId: 'visibility_diagnosis',
    label: 'AI visibility',
    icon: Eye,
    message: 'Why do AI answers miss us? Diagnose where we are absent and what to fix first.',
  },
  {
    workflowId: 'page_edits',
    label: 'Search traffic',
    icon: TrendingUp,
    message:
      'Find the page with the most search traffic to gain and draft the edits that would win it.',
  },
  {
    workflowId: 'article',
    label: 'Write an article',
    icon: FileText,
    message: 'Find the article or guide most worth writing next and draft it.',
  },
];

export function QuickStarts({
  workspaceId,
  projectId,
  onStart,
  pending,
  disabled,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  onStart: (input: NewChatInput) => void;
  pending: boolean;
  disabled: boolean;
}>) {
  const actions = useQuery(actionsQueries.list({ workspaceId, projectId }));
  const top = actions.data?.items.slice(0, AGENT_BRIEFING_ACTIONS) ?? [];
  const locked = disabled || pending;
  return (
    <Inline as="nav" aria-label="Quick starts" wrap>
      <Button
        variant="secondary"
        box="share"
        disabled={locked || actions.isPending}
        onClick={() =>
          onStart({
            message: BRIEFING_REQUEST,
            skillId: 'growth_plan',
            context: {},
            mentions: top.map((action) => action.id),
          })
        }
      >
        <Icon icon={Sparkles} />
        Brief me
      </Button>
      {QUICK_STARTS.map((start) => (
        <Button
          key={start.workflowId}
          variant="secondary"
          box="share"
          disabled={locked}
          onClick={() =>
            onStart({
              message: start.message,
              skillId: undefined,
              workflowId: start.workflowId,
              context: {},
            })
          }
        >
          <Icon icon={start.icon} />
          {start.label}
        </Button>
      ))}
    </Inline>
  );
}
