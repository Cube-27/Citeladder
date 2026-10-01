import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../src/db/database.ts';
import { agentPolicy, type Scope, type SkillCatalog } from '../src/agent/contracts.ts';
import { AgentStore, type FundingIdentity } from '../src/agent/store.ts';
import { AgentQueue } from '../src/agent/queue.ts';
import {
  ModelCalls,
  type AgentModel,
  type Funding,
  type ModelResult,
  type ModelRequest,
} from '../src/agent/model-calls.ts';
import { AgentRuntime } from '../src/agent/runtime.ts';
import { ToolRegistry } from '../src/agent/tools.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

export const catalog: SkillCatalog = {
  version: 'test-skills-1',
  operatingContract: 'Use only supplied evidence.',
  skills: new Map([
    [
      'content',
      {
        id: 'content',
        version: 1,
        outputKind: 'content',
        body: 'Write requested content.',
        outlineFirst: true,
      },
    ],
    [
      'plan',
      {
        id: 'plan',
        version: 1,
        outputKind: 'plan',
        body: 'Plan requested work.',
        outlineFirst: false,
      },
    ],
  ]),
};
export const emptyPackage = {
  version: 'content-context-v1',
  brand_block: '',
  target_page_block: '',
  issue_block: '',
  related_site_block: '',
  summary: { omissions: [{ reason: 'no_persisted_evidence', count: 1 }] },
};
export function result(content: unknown): ModelResult {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    provider_adapter: 'test',
    endpoint_host: 'model.example.test',
    requested_model: 'test-model',
    returned_model: 'test-model',
    usage: { input_tokens: 20, output_tokens: 10 },
    latency_ms: 1,
    finish_status: 'stop',
  };
}
export const reply = (text = 'Answer from supplied evidence.') => ({
  action: 'respond',
  reply: text,
});
export const deliverable = (phase = 'draft', body = 'Requested document') => ({
  action: 'respond',
  reply: 'Saved your document.',
  output: { title: 'Document', body, phase },
});
export function scripted(
  steps: unknown[],
  onCall?: (request: ModelRequest, ordinal: number) => Promise<void>,
): AgentModel {
  let count = 0;
  return {
    model: 'test-model',
    adapter: 'test',
    endpointHost: 'model.example.test',
    retryableError: () => false,
    complete: async (request) => {
      await onCall?.(request, count + 1);
      return result(steps[count++] ?? reply());
    },
  };
}
export const zeroFunding: Funding = {
  reserve: async () => ({ reservationId: null, credits: 0, pricingRevision: '' }),
  settle: async () => ({ credits: 0, status: 'zero_debit' }),
};
export class AgentFixtures extends VisibilityFixtures {
  readonly agentDb: Database;
  readonly scopes: Scope[] = [];
  constructor(db: Database) {
    super(db);
    this.agentDb = db;
  }
  async scope() {
    const scope = await this.tenant();
    this.scopes.push(scope);
    return scope;
  }
  store(overrides: Partial<AgentStore['dependencies']> = {}) {
    return new AgentStore(this.agentDb, {
      catalog,
      registryVersion: 'test-tools-1',
      timeoutSeconds: 10,
      admission: async () =>
        ({
          funding_source: 'development',
          requested_model: 'test-model',
          route_id: null,
          connection_id: null,
          route_revision: null,
          credential_revision: null,
        }) satisfies FundingIdentity,
      context: async () => emptyPackage,
      ...overrides,
    });
  }
  tools(scope: Scope) {
    return new ToolRegistry('test-tools-1', [
      {
        name: 'read_evidence',
        description: 'Read persisted fixture evidence.',
        arguments: z.object({}).strict(),
        read: async (received) => {
          if (received.projectId !== scope.projectId)
            throw new Error('Wrong server-pinned project');
          return {
            state: 'available',
            data: { observed: 0 },
            artifactRefs: [
              { id: scope.projectId, record_uri: `citeladder://project/${scope.projectId}` },
            ],
            omissions: [],
          };
        },
      },
    ]);
  }
  runtime(scope: Scope, model: AgentModel, overrides: Partial<AgentRuntime['deps']> = {}) {
    return new AgentRuntime(this.agentDb, {
      catalog,
      tools: this.tools(scope),
      models: new ModelCalls(this.agentDb, zeroFunding),
      modelFor: () => model,
      attachTarget: async (_db, _chat, _output, payload) => {
        if (payload.target)
          throw new Error('Target adapter is deliberately not configured in this fixture');
      },
      ...overrides,
    });
  }
  async claimed(
    scope: Scope,
    options: { skillId?: string; message?: string; chatId?: string } = {},
  ) {
    const run = await this.store().enqueue(scope, {
      message: options.message ?? 'Please help.',
      key: randomUUID(),
      ...options,
    });
    const queue = new AgentQueue(this.agentDb, 30);
    const claimed = await queue.claim('test-worker', [scope.workspaceId]);
    if (claimed?.id !== run.id) throw new Error('Unexpected claim');
    const lease = await queue.start(claimed, 'test-worker');
    return { run, lease, queue };
  }
  async run(id: string) {
    return this.agentDb
      .selectFrom('agent_runs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }
  async cleanup() {
    for (const scope of this.scopes) {
      await this.agentDb
        .deleteFrom('agent_model_attempts')
        .where('workspace_id', '=', scope.workspaceId)
        .execute();
    }
    await super.cleanup();
  }
}
export { agentPolicy };
