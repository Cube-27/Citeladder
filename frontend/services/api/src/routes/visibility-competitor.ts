/** One roster competitor against the brand: a `visibility` family route, served by `visibility.ts`. */
import { competitorFocusSchema } from '@citeladder/contracts/visibility-competitor';

import { notFound } from '../errors.ts';
import { getCompetitorFocus } from '../visibility/competitor-focus.ts';
import { defineGetRoute } from './define.ts';
import {
  PERCEPTION_SELECTION,
  PROJECT_PATH,
  runSelection,
  selectionErrors,
} from './visibility-selection.ts';

export const competitorFocusRoute = defineGetRoute({
  family: 'visibility',
  authorize: 'active-project',
  path: '/api/v1/projects/{project_id}/visibility/competitors/{name}',
  params: {
    path: {
      ...PROJECT_PATH,
      name: { scalar: { kind: 'str', minLength: 1, maxLength: 255 }, required: true },
    },
    query: PERCEPTION_SELECTION,
  },
  response: competitorFocusSchema,
  async handle({ c, db }, { path, query }) {
    const workspace = c.get('workspace');
    const focus = await selectionErrors(() =>
      getCompetitorFocus(
        db,
        runSelection(workspace.workspaceId, path.project_id, query),
        path.name,
      ),
    );
    if (focus === null) throw notFound('Competitor');
    return focus;
  },
});
