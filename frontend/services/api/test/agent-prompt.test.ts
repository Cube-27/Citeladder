import { describe, expect, it } from 'vitest';
import { admittedBudget } from '../src/agent/contracts.ts';
import { assemblePrompt } from '../src/agent/prompt.ts';
import { suppliedManifest } from '../src/agent/context.ts';
import { boundToolData } from '../src/agent/tools.ts';
import { emptyPackage } from './agent-support.ts';

describe('structurally bounded Agent prompts', () => {
  const input = {
    system: 'Instructions',
    schema: {},
    request: 'Refine this document',
    context: '{}',
    revision: { id: 'exact-revision', body: '😀\\\"'.repeat(4000) },
    history: Array.from({ length: 12 }, (_, index) => ({
      role: 'user',
      content: `${index}:` + 'h'.repeat(5000),
    })),
    historyLimited: true,
    observations: Array.from({ length: 6 }, (_, index) => ({
      text: JSON.stringify({ index, body: 'o'.repeat(11000) }),
      refs: [`record:${index}`],
    })),
    budget: admittedBudget(10),
  };
  it('preserves exact Unicode revisions, newest history and whole tool observations under pressure', () => {
    const prompt = assemblePrompt(input);
    const user = JSON.parse(prompt.request.user);
    expect(user.current_revision).toEqual(input.revision);
    expect(user.request).toBe(input.request);
    expect(prompt.serializedChars).toBeLessThanOrEqual(input.budget.transcript_max_chars);
    expect(user.omissions).toContain('oldest_history_messages');
    expect(user.omissions).toContain('history_query_limit');
    for (const text of user.observations) expect(() => JSON.parse(text)).not.toThrow();
    expect(prompt.citations).toEqual(
      user.observations.map((text: string) => `record:${JSON.parse(text).index}`),
    );
  });
  it('refuses a legal oversized saved revision before dispatch without changing it', () => {
    const revision = { body: 'x'.repeat(100000) };
    expect(() => assemblePrompt({ ...input, revision })).toThrow('output_context_size_limit');
    expect(revision.body).toHaveLength(100000);
  });
  it('keeps selected issue totals and whole occurrence samples when background exceeds the budget', () => {
    const occurrences = Array.from({ length: 10 }, (_, index) => ({
      site_url_id: `page-${index}`,
      display_url: `https://example.test/${index}`,
      evidence: { descriptors: 'x'.repeat(2300) },
    }));
    const manifest = {
      version: 'agent-context-1',
      refs: {},
      instructions: null,
      action: null,
      mentions: [],
      package: {
        ...emptyPackage,
        sections: {
          brand: { name: 'Example', facts: 'b'.repeat(4000) },
          issue_group: {
            affected_url_count: 94,
            occurrence_count: 94,
            occurrences,
            sample: { supplied_occurrences: 10, total_occurrences: 94, complete: false },
          },
          related_site: [{ body: 'r'.repeat(24000) }],
        },
      },
    };
    const supplied = suppliedManifest(manifest);
    const group = JSON.parse(supplied.text).package.sections.issue_group;
    expect(group.affected_url_count).toBe(94);
    expect(group.occurrences.length).toBeGreaterThan(0);
    expect(group.occurrences.length).toBeLessThan(10);
    expect(group.occurrences).toEqual(occurrences.slice(0, group.occurrences.length));
    expect(group.sample).toEqual({
      supplied_occurrences: group.occurrences.length,
      total_occurrences: 94,
      complete: false,
    });
    expect(manifest.package.sections.issue_group.occurrences).toHaveLength(10);
    expect(supplied.omissions).toContain('package.sections.issue_group.occurrences');
    expect(supplied.text.length).toBeLessThanOrEqual(input.budget.context_package_max_chars);
  });
  it('retains small evidence families when one family makes the overview oversized', () => {
    const health = { state: 'available', count: 94 };
    const bounded = boundToolData(
      { evidence: { health, opportunities: { items: 'x'.repeat(10000) } } },
      300,
    );
    expect(JSON.parse(bounded.text)).toEqual({
      data: { evidence: { health } },
      complete: false,
      omitted_sections: ['evidence.opportunities'],
    });
    expect(bounded.omissions).toContainEqual(
      expect.objectContaining({ sections: ['evidence.opportunities'] }),
    );
  });
  it('omits a large diagnosis as one section and withdraws its citation grant', () => {
    const source = '00000000-0000-4000-8000-000000000001';
    const manifest = {
      version: 'agent-context-1',
      refs: {},
      instructions: null,
      mentions: [],
      package: emptyPackage,
      action: {
        id: source,
        target_label: 'Action',
        skill_id: null,
        diagnosis: { what_happened: [{ opportunity_id: source }], bulky: 'x'.repeat(10000) },
      },
    };
    const supplied = suppliedManifest(manifest, 1500);
    expect(JSON.parse(supplied.text).action.diagnosis).toEqual({});
    expect(supplied.citations.size).toBe(0);
    expect(supplied.omissions).toContain(`action.diagnosis:${source}`);
  });
  it('keeps generic tool envelopes valid and labels whole omitted fields', () => {
    const bounded = boundToolData({ count: 119, details: '😀\\\"'.repeat(10000) }, 500);
    expect(JSON.parse(bounded.text)).toEqual({
      data: { count: 119 },
      complete: false,
      omitted_sections: ['details'],
    });
    expect(bounded.supplied).toBe(true);
    expect(bounded.text.length).toBeLessThanOrEqual(500);
  });
});
