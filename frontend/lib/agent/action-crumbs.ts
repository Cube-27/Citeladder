import { z } from 'zod';
import {
  actionGoalSchema,
  actionGroupingSchema,
  actionStatusSchema,
} from '@citeladder/contracts/actions';

import { ACTION_GOAL_LABEL, ACTION_GROUPING_LABEL } from '@/lib/agent/vocabulary';

/**
 * Where a breadcrumb step opens the Actions list: that status's goal, and
 * that grouping under it, open and scrolled to. Carried as history state,
 * so it is parsed where it is read.
 */
export const listJumpSchema = z.object({
  status: actionStatusSchema,
  goal: actionGoalSchema,
  grouping: actionGroupingSchema.optional(),
});
export type ListJump = z.infer<typeof listJumpSchema>;

/** The Action a URL page was opened from, for its trail and its way back. */
export const fromActionSchema = z.object({
  fromAction: listJumpSchema.required().extend({ id: z.uuid(), title: z.string() }),
});
export type FromAction = z.infer<typeof fromActionSchema>['fromAction'];

/** Actions › goal › grouping, each opening the list there. */
export function listCrumbs(
  at: Required<ListJump>,
): { label: string; href: string; state?: ListJump }[] {
  return [
    { label: 'Actions', href: '/actions' },
    {
      label: ACTION_GOAL_LABEL[at.goal],
      href: '/actions',
      state: { status: at.status, goal: at.goal } satisfies ListJump,
    },
    {
      label: ACTION_GROUPING_LABEL[at.grouping],
      href: '/actions',
      state: { status: at.status, goal: at.goal, grouping: at.grouping } satisfies ListJump,
    },
  ];
}
