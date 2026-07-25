'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { httpErrorStatus } from '@/lib/api/errors';
import { projectsApi } from '@/lib/api/projects';

import { normalizeWebsiteUrl, type BrandStepValues } from './forms';

/**
 * AI auto-discovery for onboarding step 2.
 *
 * All three suggestion calls — owned domains, competitors, prompts — fire
 * automatically and in parallel the moment the step is entered. There is no
 * "Generate" button: discovery *is* the step, and making the user ask for the
 * thing they came for would be friction in front of the product's core value.
 *
 * The three are independent on purpose. They hit separate endpoints and fail
 * separately, so one unconfigured or flaky call must not blank the other two —
 * each section reports its own status and retries on its own.
 *
 * `confirm_send_evidence` is always true. The backend still requires it, but
 * the UI no longer asks per action (plan.md §10, decision 13).
 */
export type SectionStatus = 'idle' | 'loading' | 'done' | 'error';

export type DiscoverySection<T> = {
  status: SectionStatus;
  data: T;
  error: unknown;
  /** True when the failure was 503 — no agent configured, so manual is the path. */
  unconfigured: boolean;
};

export type DiscoveryState = {
  domains: DiscoverySection<string[]>;
  competitors: DiscoverySection<Array<{ name: string; domains: string[] }>>;
  prompts: DiscoverySection<Array<{ text: string; theme: string; intent: string }>>;
};

const idle = <T>(data: T): DiscoverySection<T> => ({
  status: 'idle',
  data,
  error: null,
  unconfigured: false,
});

const INITIAL: DiscoveryState = {
  domains: idle<string[]>([]),
  competitors: idle<Array<{ name: string; domains: string[] }>>([]),
  prompts: idle<Array<{ text: string; theme: string; intent: string }>>([]),
};

type SectionKey = keyof DiscoveryState;

export function useDiscovery(brand: BrandStepValues | null) {
  const [state, setState] = useState<DiscoveryState>(INITIAL);
  // Guards against React 18 double-effect in dev and against re-firing when the
  // parent re-renders: discovery is expensive and must run once per brand.
  const firedFor = useRef<string | null>(null);

  const patch = useCallback(<K extends SectionKey>(key: K, next: Partial<DiscoveryState[K]>) => {
    setState((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  }, []);

  const runSection = useCallback(
    async (key: SectionKey, values: BrandStepValues) => {
      patch(key, { status: 'loading', error: null, unconfigured: false });
      const base = {
        brand_name: values.brand_name.trim(),
        website_url: normalizeWebsiteUrl(values.website_url),
        country_code: values.country_code,
        language_code: values.language_code,
        confirm_send_evidence: true as const,
      };
      try {
        if (key === 'domains') {
          const res = await projectsApi.suggestOwnedDomains(base);
          patch('domains', { status: 'done', data: res.domains });
        } else if (key === 'competitors') {
          const res = await projectsApi.suggestCompetitors(base);
          patch('competitors', {
            status: 'done',
            data: res.competitors.map((c) => ({ name: c.name, domains: c.domains })),
          });
        } else {
          const res = await projectsApi.suggestPrompts(base);
          patch('prompts', { status: 'done', data: res.prompts });
        }
      } catch (error) {
        patch(key, {
          status: 'error',
          error,
          unconfigured: httpErrorStatus(error) === 503,
        });
      }
    },
    [patch],
  );

  const runAll = useCallback(
    (values: BrandStepValues) => {
      // Deliberately not awaited together — each section renders as it lands, so
      // the panel fills in progressively instead of appearing all at once.
      void runSection('domains', values);
      void runSection('competitors', values);
      void runSection('prompts', values);
    },
    [runSection],
  );

  useEffect(() => {
    if (!brand) return;
    const key = `${brand.brand_name}|${brand.website_url}`;
    if (firedFor.current === key) return;
    firedFor.current = key;
    runAll(brand);
  }, [brand, runAll]);

  const retry = useCallback(
    (key: SectionKey) => {
      if (brand) void runSection(key, brand);
    },
    [brand, runSection],
  );

  const sections = [state.domains, state.competitors, state.prompts];
  const isRunning = sections.some((s) => s.status === 'loading' || s.status === 'idle');
  const allFailed = sections.every((s) => s.status === 'error');
  // 503 from every section means the agent simply is not configured — that is a
  // deployment state, not a failure the user can retry their way out of.
  const agentUnconfigured = sections.every((s) => s.unconfigured);

  return { state, isRunning, allFailed, agentUnconfigured, retry };
}
