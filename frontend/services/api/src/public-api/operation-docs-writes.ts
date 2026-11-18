/** Page text of the public write operations; see `operation-docs.ts`. */
import type { OperationDoc } from './operation-docs.ts';

const IDEMPOTENT = ' Send an Idempotency-Key header so a retry never runs it twice.';

export const writeDocs: Readonly<Record<string, OperationDoc>> = {
  'POST /prompt-sets/{prompt_set_id}/prompts': {
    summary: 'Create prompts',
    description: `Adds a batch of prompts to a prompt set and returns the created prompts.${IDEMPOTENT}`,
  },
  'POST /prompt-sets/{prompt_set_id}/generate': {
    summary: 'Generate prompts',
    description: `Asks CiteLadder to propose new prompts for a prompt set, optionally for chosen topics. The proposals arrive as candidates to review; nothing is added to the prompt set until you accept them.${IDEMPOTENT}`,
  },
  'POST /prompt-sets/{prompt_set_id}/import': {
    summary: 'Import prompts',
    description: `Imports a list of prompts into a prompt set and returns the updated set.${IDEMPOTENT}`,
  },
  'POST /prompt-sets/{prompt_set_id}/candidates/review': {
    summary: 'Review prompt candidates',
    description: `Accepts or rejects candidate prompts by id. Accepted candidates become prompts of the set.${IDEMPOTENT}`,
  },
  'PATCH /prompts/{prompt_id}': {
    summary: 'Update a prompt',
    description:
      'Changes a prompt’s text or its classification. Send only the fields to change; the updated prompt is returned.',
  },
  'DELETE /prompts/{prompt_id}': {
    summary: 'Delete a prompt',
    description:
      'Deletes a prompt from its prompt set. Answers already recorded for it stay in past audits.',
  },
  'POST /topics': {
    summary: 'Create a topic',
    description: `Creates a topic, optionally under a parent topic, and returns it.${IDEMPOTENT}`,
  },
  'PATCH /topics/{topic_id}': {
    summary: 'Update a topic',
    description: 'Renames a topic, changes its description or moves it under another parent.',
  },
  'DELETE /topics/{topic_id}': {
    summary: 'Delete a topic',
    description: 'Deletes a topic. Its prompts are kept.',
  },
  'POST /competitors': {
    summary: 'Add a competitor',
    description: `Starts tracking a competitor by name, aliases and domains, and returns it.${IDEMPOTENT}`,
  },
  'PATCH /competitors/{competitor_id}': {
    summary: 'Update a competitor',
    description: 'Changes a competitor’s name, aliases or domains. Send only the fields to change.',
  },
  'DELETE /competitors/{competitor_id}': {
    summary: 'Remove a competitor',
    description: 'Stops tracking a competitor. Answers already recorded keep what they found.',
  },
  'POST /competitor-suggestions/{candidate_id}/accept': {
    summary: 'Accept a competitor suggestion',
    description: `Turns a suggested company into a tracked competitor and returns the competitor.${IDEMPOTENT}`,
  },
  'POST /audits': {
    summary: 'Launch an audit',
    description: `Queues an audit of a prompt set, or of chosen prompts, on the engines you name, and returns the created audits. Each recorded answer spends one prompt run; set max_attempts to cap the spend, and estimate first with the estimate operation.${IDEMPOTENT}`,
    request: {
      prompt_set_id: '00000000-0000-4000-8000-000000000001',
      engines: ['chatgpt'],
      max_attempts: 12,
    },
  },
  'POST /audits/{audit_id}/cancel': {
    summary: 'Cancel an audit',
    description: `Stops an audit that has not finished and returns it. Answers already recorded are kept.${IDEMPOTENT}`,
  },
  'POST /audit-schedules': {
    summary: 'Create an audit schedule',
    description: `Creates a schedule that launches audits of a prompt set on a cadence and returns it.${IDEMPOTENT}`,
  },
  'PATCH /audit-schedules/{schedule_id}': {
    summary: 'Update an audit schedule',
    description:
      'Changes a schedule’s prompt set, cadence, time zone or engines. Send only the fields to change.',
  },
  'DELETE /audit-schedules/{schedule_id}': {
    summary: 'Delete an audit schedule',
    description: 'Deletes a schedule. Audits it already launched are kept.',
  },
  'PATCH /actions/{action_id}': {
    summary: 'Update an action’s status',
    description: 'Moves one action to a new status and returns it.',
  },
  'POST /actions/status': {
    summary: 'Update many actions’ status',
    description: `Moves several actions to one status, chosen by id or by a filter, and returns how many changed.${IDEMPOTENT}`,
  },
  'POST /actions/{action_id}/declaration': {
    summary: 'Record an implementation',
    description: `Declares that an action was implemented, so CiteLadder can measure its effect. A repeat of the same declaration returns the existing one with status 200.${IDEMPOTENT}`,
  },
};
