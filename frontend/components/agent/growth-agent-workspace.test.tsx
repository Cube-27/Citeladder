import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/render';
import { agentApi, type AgentTaskRun } from '@/lib/api/agent';
import { ApiError } from '@/lib/api/errors';
import { GrowthAgentWorkspace } from './growth-agent-workspace';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const STEP_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({
    activeProject: { id: PROJECT_ID, name: 'Asian School' },
    isLoading: false,
  }),
}));

vi.mock('@/lib/api/agent', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('@/lib/api/agent')>();
  return {
    ...original,
    agentApi: {
      capabilities: vi.fn(),
      createConversation: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      listTasks: vi.fn(),
      submitTask: vi.fn(),
      decide: vi.fn(),
      cancel: vi.fn(),
    },
  };
});

function run(status = 'awaiting_user'): AgentTaskRun {
  return {
    id: RUN_ID,
    project_id: PROJECT_ID,
    conversation_id: CONVERSATION_ID,
    parent_run_id: null,
    context_package_id: null,
    task_type: 'build_roadmap',
    objective: 'Build an admissions roadmap',
    requested_outputs: [],
    task_policy_version: 'growth-agent-v1',
    allowed_tools: [],
    resource_scope: {},
    industry_pack_id: 'education',
    industry_pack_version: '1',
    status,
    plan: [],
    result: {
      decisions_remaining: ['save_content'],
      conclusion: 'Prioritize the admissions journey first.',
      next_step: 'Review the generated draft.',
      citations: [],
      artifacts_created: [],
    },
    validation: null,
    decisions: [],
    provider_adapter: 'deterministic',
    endpoint_host: '',
    model: 'bounded-projection-v1',
    capability_snapshot: {},
    instruction_version: 'v1',
    skill_version: 'v1',
    usage: null,
    latency_ms: null,
    error_code: '',
    error_detail: '',
    completed_at: null,
    cancelled_at: null,
    created_at: '2026-08-09T00:00:00Z',
    updated_at: '2026-08-09T00:00:00Z',
    steps: [
      {
        id: STEP_ID,
        ordinal: 1,
        name: 'Prepare the roadmap.',
        tool_name: 'site.roadmap',
        tool_version: '1.0.0',
        tool_kind: 'save_content',
        status,
        input: {},
        output: null,
        child_task_kind: '',
        child_task_id: null,
        retry_count: 0,
        error_code: '',
        error_detail: '',
        started_at: null,
        completed_at: null,
      },
    ],
    context: null,
  };
}

const conversation = {
  id: CONVERSATION_ID,
  project_id: PROJECT_ID,
  title: 'Admissions roadmap',
  created_by_user_id: null,
  created_at: '2026-08-09T00:00:00Z',
  updated_at: '2026-08-09T00:00:00Z',
};

describe('GrowthAgentWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    vi.mocked(agentApi.capabilities).mockResolvedValue({
      configured: false,
      provider_adapter: '',
      endpoint_host: '',
      model: '',
      model_capabilities: {},
      policy_version: 'v1',
      context_policy_version: 'v1',
      tool_registry_version: 'v1',
      task_catalog: [
        {
          task_type: 'build_roadmap',
          title: 'Build roadmap',
          description: 'Build it',
          allowed_tools: [],
          required_scope: [],
          requested_outputs: [],
          max_steps: 8,
          max_tool_calls: 8,
        },
      ],
      tool_catalog: [],
    });
    vi.mocked(agentApi.listConversations).mockResolvedValue([conversation]);
    vi.mocked(agentApi.getConversation).mockResolvedValue({
      ...conversation,
      messages: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          conversation_id: CONVERSATION_ID,
          task_run_id: RUN_ID,
          role: 'user',
          content: 'Build an admissions roadmap',
          citations: [],
          created_at: '2026-08-09T00:00:00Z',
        },
      ],
    });
    vi.mocked(agentApi.listTasks).mockResolvedValue([run()]);
    vi.mocked(agentApi.submitTask).mockResolvedValue(run('completed'));
    vi.mocked(agentApi.createConversation).mockResolvedValue(conversation);
    vi.mocked(agentApi.decide).mockResolvedValue(run('awaiting_task'));
    vi.mocked(agentApi.cancel).mockResolvedValue(run('cancelled'));
  });

  it('renders a conversation-first workspace with bounded task detail', async () => {
    renderWithProviders(<GrowthAgentWorkspace />);

    expect(await screen.findByText('Build an admissions roadmap')).toBeInTheDocument();
    expect(screen.getByText('Uses approved project evidence')).toBeInTheDocument();
    expect(screen.getByText('Your decision is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Message Growth Agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('sends a message into the selected durable conversation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GrowthAgentWorkspace />);

    const composer = await screen.findByLabelText('Message Growth Agent');
    await user.type(composer, 'Explain the highest-priority gap');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(agentApi.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: CONVERSATION_ID,
          objective: 'Explain the highest-priority gap',
          task_type: 'build_roadmap',
        }),
        expect.any(String),
      ),
    );
    expect(agentApi.createConversation).not.toHaveBeenCalled();
  });

  it('shows a conversation load failure without replacing the conversation workspace', async () => {
    vi.mocked(agentApi.getConversation).mockRejectedValue(
      new ApiError('Conversation unavailable', 404, ''),
    );

    renderWithProviders(<GrowthAgentWorkspace />);

    expect(
      await screen.findByText('The conversation could not be loaded. Refresh and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Message Growth Agent')).toBeInTheDocument();
  });

  it('shows a capabilities failure beside the composer', async () => {
    vi.mocked(agentApi.capabilities).mockRejectedValue(
      new ApiError('Capabilities unavailable', 400, ''),
    );

    renderWithProviders(<GrowthAgentWorkspace />);

    expect(
      await screen.findByText('Agent capabilities could not be loaded. Refresh and try again.'),
    ).toHaveAttribute('role', 'alert');
  });

  it('shows a cancellation failure through the composer error state', async () => {
    const user = userEvent.setup();
    vi.mocked(agentApi.cancel).mockRejectedValue(new Error('The task could not be cancelled.'));
    renderWithProviders(<GrowthAgentWorkspace />);

    await user.click(await screen.findByRole('button', { name: 'Cancel task' }));

    expect(await screen.findByText('The task could not be cancelled.')).toHaveAttribute(
      'role',
      'alert',
    );
  });

  it('selects the most recent run for the active conversation', async () => {
    const olderRun = run('awaiting_user');
    const newerRun = run('running');
    newerRun.id = '66666666-6666-4666-8666-666666666666';
    newerRun.created_at = '2026-08-09T01:00:00Z';
    newerRun.updated_at = '2026-08-09T01:00:00Z';
    newerRun.steps[0]!.id = '77777777-7777-4777-8777-777777777777';
    newerRun.steps[0]!.status = 'running';
    vi.mocked(agentApi.listTasks).mockResolvedValue([olderRun, newerRun]);

    renderWithProviders(<GrowthAgentWorkspace />);

    expect(await screen.findByText('Working · 1 step')).toBeInTheDocument();
    expect(screen.queryByText('Your decision is required')).not.toBeInTheDocument();
  });

  it('synchronizes the composer when the objective query parameter changes', async () => {
    searchParams = new URLSearchParams({ objective: 'Explain current demand' });
    const view = renderWithProviders(<GrowthAgentWorkspace />);

    expect(await screen.findByLabelText('Message Growth Agent')).toHaveValue(
      'Explain current demand',
    );

    searchParams = new URLSearchParams({ objective: 'Explain the latest recrawl' });
    view.rerender(<GrowthAgentWorkspace />);

    await waitFor(() =>
      expect(screen.getByLabelText('Message Growth Agent')).toHaveValue(
        'Explain the latest recrawl',
      ),
    );
  });

  it('records the explicit save-content decision from the conversation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GrowthAgentWorkspace />);

    await user.click(await screen.findByRole('button', { name: 'Review decision' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(agentApi.decide).toHaveBeenCalledWith(PROJECT_ID, RUN_ID, 'save_content', true),
    );
  });

  it('creates a conversation only when starting a new chat', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GrowthAgentWorkspace />);

    await user.click(await screen.findByRole('button', { name: 'New conversation' }));
    await user.type(screen.getByLabelText('Message Growth Agent'), 'What changed after recrawl?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(agentApi.createConversation).toHaveBeenCalledWith(
        PROJECT_ID,
        'What changed after recrawl?',
      ),
    );
  });

  it('shows a completed task once as the assistant reply without backend task scaffolding', async () => {
    const completedRun = run('completed');
    completedRun.result = {
      conclusion: 'The bounded task completed.',
      next_step: 'Inspect the cited evidence.',
      limitations: ['demand.read_snapshot is unavailable'],
      citations: [],
      artifacts_created: [],
    };
    vi.mocked(agentApi.listTasks).mockResolvedValue([completedRun]);
    vi.mocked(agentApi.getConversation).mockResolvedValue({
      ...conversation,
      messages: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          conversation_id: CONVERSATION_ID,
          task_run_id: RUN_ID,
          role: 'assistant',
          content: 'The bounded task completed.',
          citations: [],
          created_at: '2026-08-09T00:00:00Z',
        },
      ],
    });

    renderWithProviders(<GrowthAgentWorkspace />);

    expect(await screen.findByText('The bounded task completed.')).toBeInTheDocument();
    expect(screen.getAllByText('The bounded task completed.')).toHaveLength(1);
    expect(screen.queryByText(/Plan Steps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/demand\.read_snapshot/)).not.toBeInTheDocument();
  });

  it('does not expose raw scope JSON when a contextual action lacks its source', async () => {
    searchParams = new URLSearchParams({ task: 'create_brief', objective: 'Create a brief' });
    vi.mocked(agentApi.capabilities).mockResolvedValue({
      configured: false,
      provider_adapter: '',
      endpoint_host: '',
      model: '',
      model_capabilities: {},
      policy_version: 'v1',
      context_policy_version: 'v1',
      tool_registry_version: 'v1',
      task_catalog: [
        {
          task_type: 'create_brief',
          title: 'Create content brief',
          description: 'Create it',
          allowed_tools: [],
          required_scope: ['question_id'],
          requested_outputs: [],
          max_steps: 8,
          max_tool_calls: 8,
        },
      ],
      tool_catalog: [],
    });

    renderWithProviders(<GrowthAgentWorkspace />);

    expect(await screen.findByText(/needs a selected source item/i)).toBeInTheDocument();
    expect(screen.queryByText(/Required scope/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/question_id/i)).not.toBeInTheDocument();
    expect(screen.queryByText('JSON scope')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
