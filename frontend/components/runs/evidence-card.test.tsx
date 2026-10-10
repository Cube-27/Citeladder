import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { ExecutionEvidence } from '@/lib/api/types';
import { EvidenceCard } from './evidence-card';

const ID = '11111111-1111-4111-8111-111111111111';
const evidence: ExecutionEvidence = {
  id: ID,
  analysis_id: ID,
  audit_id: ID,
  task_id: ID,
  artifact_id: null,
  analyzer_version: '1',
  scoring_rule_version: '1',
  logical_engine: 'chatgpt',
  transport_provider: 'openai',
  transport_model: 'gpt-4',
  retrieval_enabled: true,
  prompt_index: 0,
  repetition: 1,
  prompt_class: 'unbranded',
  cohort: 'core',
  brand_mentioned: true,
  brand_first_offset: null,
  owned_domain_cited: false,
  owned_citation_count: 0,
  unintended_domain_cited: false,
  citation_count: 0,
  search_used: false,
  search_query_count: 0,
  avg_position: null,
  score: null,
  citations: [],
  competitors_mentioned: [],
  search_surface: null,
  created_at: '2026-01-15T00:00:00Z',
};

describe('Brand match evidence', () => {
  it.each([
    [true, null, 'Brand detected; match position unavailable'],
    [true, 0, 'First match at character 0'],
    [false, null, 'No tracked brand alias appeared in the answer'],
  ] as const)('keeps mention %s and offset %s distinct', (mentioned, offset, label) => {
    render(
      <EvidenceCard
        evidence={{ ...evidence, brand_mentioned: mentioned, brand_first_offset: offset }}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
