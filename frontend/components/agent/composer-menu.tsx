import { useQuery } from '@tanstack/react-query';

import { SkillOptions, SkillsSubmenu, type SkillChoice } from '@/components/agent/skill-picker';
import type { ComposerMenuState } from '@/components/agent/use-composer-commands';
import {
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@/components/ui/menu';
import { PromptActionMenu, PromptMenuLink } from '@/components/ui/prompt-action-menu';
import { actionHandoffHref } from '@/lib/agent/handoff';
import { actionTitle } from '@/lib/agent/action-title';
import { targetKindLabel } from '@/lib/agent/vocabulary';
import { actionsQueries } from '@/lib/api/actions';
import { AGENT_TOP_ACTIONS } from '@/lib/config/agent';

/**
 * The composer's + menu, shared by every composer: Skills sets the next
 * turn's skill; Actions starts a chat on one of the project's top open
 * Actions, or opens the Actions list.
 */
export function ComposerMenu({
  menu,
  scope,
  skill,
  disabled,
}: Readonly<{
  menu: ComposerMenuState;
  scope: { workspaceId: string; projectId: string };
  skill: SkillChoice;
  disabled: boolean;
}>) {
  return (
    <PromptActionMenu
      label="Add a skill or Action"
      open={menu.open}
      onOpenChange={menu.onOpenChange}
      disabled={disabled}
      onCloseAutoFocus={menu.onCloseAutoFocus}
    >
      {menu.skillsOnly ? (
        // Typing `/` asked for a skill: the menu is the skills list itself.
        <SkillOptions choice={skill} onSelect={menu.onSelect} />
      ) : (
        <>
          <SkillsSubmenu choice={skill} onSelect={menu.onSelect} />
          <ActionsSubmenu scope={scope} />
        </>
      )}
    </PromptActionMenu>
  );
}

function ActionsSubmenu({
  scope,
}: Readonly<{ scope: { workspaceId: string; projectId: string } }>) {
  return (
    <MenuSub>
      <MenuSubTrigger>Actions</MenuSubTrigger>
      <MenuSubContent>
        {/* Mounted with the submenu, so the Actions are read only once reached for. */}
        <TopActions scope={scope} />
        <MenuSeparator />
        <PromptMenuLink href="/agent/actions" label="All Actions" />
      </MenuSubContent>
    </MenuSub>
  );
}

/**
 * The project's top open Actions. Each opens a new chat on that Action with
 * its message already written, as "Work on" does everywhere else.
 */
function TopActions({ scope }: Readonly<{ scope: { workspaceId: string; projectId: string } }>) {
  const query = useQuery(actionsQueries.list(scope));
  if (query.isPending) return <MenuItem disabled>Loading Actions…</MenuItem>;
  if (query.isError) return <MenuItem disabled>{"Couldn't load Actions"}</MenuItem>;
  const top = query.data.items.slice(0, AGENT_TOP_ACTIONS);
  if (top.length === 0) return <MenuItem disabled>No open Actions</MenuItem>;
  return top.map((action) => {
    const title = actionTitle(action);
    return (
      <PromptMenuLink
        key={action.id}
        href={actionHandoffHref(action)}
        label={title}
        detail={targetKindLabel(action.target_kind)}
        accessibleName={`Work on ${title}`}
      />
    );
  });
}
