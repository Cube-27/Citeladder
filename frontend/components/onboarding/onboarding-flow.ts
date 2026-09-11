'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  brandDiscoveriesApi,
  type BrandDiscovery,
  type DiscoveryProfile,
} from '@/lib/api/brand-discoveries';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { Project } from '@/lib/api/types';
import { projectDestination } from '@/lib/navigation/project-destination';
import {
  brandStepSchema,
  emptyBrandStep,
  normalizeWebsiteUrl,
  type BrandStepValues,
  type ReviewCompetitor,
  type ReviewDomain,
} from '@/lib/onboarding/forms';
import { useBrandDiscovery } from '@/lib/onboarding/use-brand-discovery';
import { useProjectContext } from '@/lib/project/project-context';

import { hasConfirmedIcp } from './icp-confirmation';

export type OnboardingStep = 0 | 1 | 2;

function withBrandKnowledgeDefaults(profile: DiscoveryProfile): DiscoveryProfile {
  const category = profile.category.trim();
  const products = profile.products_services.filter((item) => item.trim());
  return {
    ...profile,
    positioning: profile.positioning.trim() || category,
    target_audience: profile.target_audience.trim() || `Buyers searching for ${category}`,
    products_services: products.length > 0 ? products : [category],
    market_scope: profile.market_scope === 'local' ? 'regional' : profile.market_scope,
  };
}

/** Insert or replace one project in a cached list, deduplicated by id. */
function upsertProject(current: Project[], project: Project): Project[] {
  const index = current.findIndex((candidate) => candidate.id === project.id);
  if (index === -1) return [...current, project];
  const next = [...current];
  next[index] = project;
  return next;
}

function selectedDomains(domains: ReviewDomain[]): string[] {
  return domains.flatMap((item) => (item.selected ? [item.domain] : []));
}

function selectedCompetitors(competitors: ReviewCompetitor[]) {
  return competitors.flatMap((item) =>
    item.selected && item.name.trim()
      ? [{ name: item.name.trim(), aliases: item.aliases, domains: item.domains }]
      : [],
  );
}

function stepQueryValue(step: OnboardingStep): 'brand' | 'discovery' | 'review' {
  return ['brand', 'discovery', 'review'][step] as 'brand' | 'discovery' | 'review';
}

function persistedBrand(input: Record<string, unknown>): BrandStepValues {
  const text = (key: string, fallback = '') =>
    typeof input[key] === 'string' ? (input[key] as string) : fallback;
  return {
    brand_name: text('brand_name'),
    website_url: text('website_url'),
    industry: text('industry'),
    subindustry: text('subindustry'),
    primary_market: text('primary_market', 'US'),
    language_code: text('language_code', 'en'),
  };
}

function isOrphanedCompletion(
  discoveryId: string | null,
  discovery: BrandDiscovery | undefined,
): boolean {
  if (!discoveryId || discovery?.project_id) return false;
  return discovery?.status === 'completing' || discovery?.status === 'project_created';
}

export function useOnboardingFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { activeWorkspaceId, setActiveProjectId } = useProjectContext();
  const isAdditional = searchParams?.get('new') === '1';
  const initialDiscoveryId = searchParams?.get('discovery') ?? null;
  const [step, setStep] = useState<OnboardingStep>(() =>
    initialDiscoveryId && searchParams?.get('step') === 'review' ? 2 : initialDiscoveryId ? 1 : 0,
  );
  const [resumeDiscoveryId, setResumeDiscoveryId] = useState<string | null>(initialDiscoveryId);
  const [brand, setBrand] = useState<BrandStepValues | null>(null);
  const [domains, setDomains] = useState<ReviewDomain[]>([]);
  const [competitors, setCompetitors] = useState<ReviewCompetitor[]>([]);
  const [profile, setProfile] = useState<DiscoveryProfile | null>(null);
  const form = useForm<BrandStepValues>({
    resolver: zodResolver(brandStepSchema),
    defaultValues: emptyBrandStep,
  });
  const discovery = useBrandDiscovery(
    step >= 1 && brand
      ? {
          brand_name: brand.brand_name.trim(),
          website_url: normalizeWebsiteUrl(brand.website_url),
          industry: brand.industry,
          subindustry: brand.subindustry,
          primary_market: brand.primary_market,
          language_code: brand.language_code,
        }
      : null,
    resumeDiscoveryId,
    activeWorkspaceId,
  );
  const catalog = useQuery({
    queryKey: ['brand-discovery-catalog'],
    queryFn: ({ signal }) => brandDiscoveriesApi.catalog({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const maximumCompetitors = catalog.data?.maximum_competitors;
  const discoveryState = discovery.discovery;
  const orphanedCompletion = isOrphanedCompletion(initialDiscoveryId, discoveryState);
  useEffect(() => {
    if (!orphanedCompletion && !brand && discoveryState) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted draft once.
      setBrand(persistedBrand(discoveryState.input_data));
    }
  }, [brand, discoveryState, orphanedCompletion]);

  useEffect(() => {
    if (!orphanedCompletion) return;
    // Project deletion preserves discovery provenance by nulling project_id.
    // A bookmarked completion URL must not resurrect that old transaction.
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- discard the stale route-owned draft.
    setResumeDiscoveryId(null);
    setBrand(null);
    setDomains([]);
    setCompetitors([]);
    setProfile(null);
    form.reset(emptyBrandStep);
    setStep(0);
    // Keep the workspace: a discarded draft still belongs to the workspace the
    // reader was creating in, and dropping it here would silently re-target
    // the retry at whichever workspace resolves by default.
    const reset = new URLSearchParams({ new: '1' });
    const workspace = searchParams?.get('workspace');
    if (workspace) reset.set('workspace', workspace);
    router.replace(`/onboarding?${reset.toString()}`, { scroll: false });
  }, [form, orphanedCompletion, router, searchParams]);

  useEffect(() => {
    if (orphanedCompletion) return;
    const discoveryId = discoveryState?.id ?? resumeDiscoveryId;
    if (!discoveryId) return;
    if (resumeDiscoveryId !== discoveryId) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- mirror the persisted discovery id.
      setResumeDiscoveryId(discoveryId);
    }
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('discovery', discoveryId);
    params.set('step', stepQueryValue(step));
    const next = params.toString();
    if (next !== searchParams?.toString()) router.replace(`/onboarding?${next}`, { scroll: false });
  }, [discoveryState?.id, orphanedCompletion, resumeDiscoveryId, router, searchParams, step]);

  useEffect(() => {
    if (discoveryState?.status !== 'ready') return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- seed an editable persisted draft.
    setDomains((current) =>
      current.length
        ? current
        : discoveryState.domains.map((domain, index) => ({
            id: `domain:${index}:${domain}`,
            domain,
            selected: true,
          })),
    );
    setProfile((current) => current ?? discoveryState.profile);
  }, [discoveryState]);

  useEffect(() => {
    if (maximumCompetitors === undefined || discoveryState?.status !== 'ready') return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- seed an editable persisted draft.
    setCompetitors((current) =>
      current.length
        ? current
        : discoveryState.competitors.map((competitor, index) => ({
            ...competitor,
            id: `competitor:${index}:${competitor.name}`,
            selected: index < maximumCompetitors,
          })),
    );
  }, [discoveryState, maximumCompetitors]);

  /**
   * Hand a CONFIRMED creation over to the shell.
   *
   * The server's success is the source of truth here, not a later full-list
   * fetch. The steps are ordered so that nothing in flight can undo it:
   *
   * 1. resolve the committed project through the authorizing detail read —
   *    that read both seeds the cache the destination will mount against and
   *    yields the workspace that owns the project;
   * 2. cancel the workspace's list read before merging, so a PRE-CREATE list
   *    already on the wire cannot land afterwards and erase the new project;
   * 3. merge (never replace) the project into a list that already exists —
   *    inserting one project does not turn an absent list into a complete
   *    inventory, so an unfetched list is left unfetched;
   * 4. navigate to a destination that NAMES the project, so the shell
   *    resolves that exact id rather than inferring one from a list;
   * 5. leave reconciliation to the background. Its failure is not allowed to
   *    undo the creation or send the reader back through it.
   */
  const openProject = useCallback(
    async (projectId: string) => {
      let project: Project | null = null;
      try {
        project = await queryClient.fetchQuery({
          queryKey: queryKeys.projects.detail(projectId),
          queryFn: ({ signal }) => projectsApi.getProject(projectId, { signal, workspaceId: null }),
        });
      } catch {
        // The project exists — the server said so. A failed read of it is a
        // transport problem, and the destination below can resolve the id
        // itself (with its own retry) rather than stranding the reader here.
      }
      setActiveProjectId(project?.id ?? projectId);
      if (project) {
        const listKey = queryKeys.projects.list(project.workspace_id);
        await queryClient.cancelQueries({ queryKey: listKey });
        const created = project;
        queryClient.setQueryData<Project[]>(listKey, (current) =>
          current === undefined ? current : upsertProject(current, created),
        );
        void projectsApi
          .refreshProjectLogos(created.id, { workspaceId: created.workspace_id })
          .then(() => queryClient.invalidateQueries({ queryKey: listKey }))
          .catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: listKey });
      }
      router.replace(projectDestination('/projects', null, project?.id ?? projectId));
    },
    [queryClient, router, setActiveProjectId],
  );

  const complete = useMutation({
    mutationFn: async () => {
      if (!brand || !discoveryState || !hasConfirmedIcp(profile)) {
        throw new Error('Confirm the required ICP fields before creating the project.');
      }
      return brandDiscoveriesApi.complete(
        discoveryState.id,
        {
          name: brand.brand_name.trim(),
          profile: withBrandKnowledgeDefaults(profile),
          domains: selectedDomains(domains),
          competitors: selectedCompetitors(competitors),
        },
        `complete:${discoveryState.id}`,
        { workspaceId: activeWorkspaceId },
      );
    },
    // The request only ACCEPTS the completion; the portfolio is generated on a
    // worker because it takes minutes and the client abandons a request after
    // 30s. A replayed completion already carries its project id and skips
    // straight through; otherwise the discovery poll below finishes the job.
    onSuccess: async (result) => {
      if (result.project_id) await openProject(result.project_id);
      else await queryClient.invalidateQueries({ queryKey: ['brand-discovery'] });
    },
  });

  const completedProjectId = discoveryState?.project_id ?? null;
  const completionFailed = discoveryState?.status === 'failed';
  useEffect(() => {
    if (!completedProjectId || completionFailed) return;
    void openProject(completedProjectId);
  }, [completedProjectId, completionFailed, openProject]);

  const submitBrand = form.handleSubmit((values) => {
    const rediscovers =
      discoveryState?.status === 'failed' ||
      (brand !== null && JSON.stringify(brand) !== JSON.stringify(values));
    if (rediscovers) {
      setDomains([]);
      setCompetitors([]);
      setProfile(null);
      setResumeDiscoveryId(null);
    }
    setBrand(values);
    setStep(1);
  });

  const toggle = useCallback(
    <T extends { selected: boolean }>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      (index: number) =>
        setter((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, selected: !item.selected } : item,
          ),
        ),
    [],
  );

  return {
    brand,
    catalog,
    competitors,
    complete,
    completionFailed,
    // Hold the action through navigation to the committed shell. Persisted
    // `completing` still protects a resumed legacy/shell-less response from a
    // duplicate click; normal completions redirect as soon as `project_id`
    // arrives and do not wait for prompt generation.
    isCompleting:
      !completionFailed &&
      (complete.isPending ||
        (complete.isSuccess && discoveryState?.status !== 'failed' && !completedProjectId) ||
        discoveryState?.status === 'completing'),
    discovery,
    domains,
    form,
    hasSelectedDomain: domains.some((item) => item.selected),
    isAdditional,
    maximumCompetitors,
    profile,
    setCompetitors,
    setDomains,
    setProfile,
    setStep,
    step,
    submitBrand,
    toggle,
  };
}
