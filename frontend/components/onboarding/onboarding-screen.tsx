'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LogoCube } from '@/components/ui/logo-cube';
import { MarketSelect } from '@/components/ui/market-select';
import { projectsApi } from '@/lib/api/projects';
import { promptsApi } from '@/lib/api/prompts';
import { queryKeys } from '@/lib/api/query-keys';
import {
  brandStepSchema,
  deriveDomain,
  emptyBrandStep,
  normalizeIntent,
  onboardingErrorMessage,
  onboardingToProjectInput,
  type BrandStepValues,
  type ReviewCompetitor,
  type ReviewDomain,
  type ReviewPrompt,
} from '@/lib/onboarding/forms';
import { useDiscovery } from '@/lib/onboarding/use-discovery';
import { useProjectContext } from '@/lib/project/project-context';
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from '@/lib/setup/markets';

import { DiscoveryProgress } from './discovery-progress';
import { PreviewPanel } from './preview-panel';
import { ReviewStep } from './review-step';

/**
 * Onboarding — the only way a project gets created (plan.md §10, decision 11;
 * `/setup` is retired).
 *
 * Three steps: Brand → Discovery → Review. Discovery fires all three suggestion
 * calls automatically on entry; there is no Generate button, because discovery
 * is the reason the screen exists.
 *
 * Second project onward (`?new=1`) runs the identical flow — the discovery is
 * the value, not a first-run formality — with two differences: the copy drops
 * the welcome framing, and Cancel returns to `/projects` instead of leaving the
 * user nowhere.
 */
const STEPS = ['Brand', 'Discovery', 'Review'] as const;
type StepIndex = 0 | 1 | 2;

export function OnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { setActiveProjectId } = useProjectContext();
  const isAdditional = searchParams?.get('new') === '1';

  const [step, setStep] = useState<StepIndex>(0);
  const [brand, setBrand] = useState<BrandStepValues | null>(null);
  const [domains, setDomains] = useState<ReviewDomain[]>([]);
  const [competitors, setCompetitors] = useState<ReviewCompetitor[]>([]);
  const [prompts, setPrompts] = useState<ReviewPrompt[]>([]);

  const form = useForm<BrandStepValues>({
    resolver: zodResolver(brandStepSchema),
    defaultValues: emptyBrandStep,
  });

  const discovery = useDiscovery(step >= 1 ? brand : null);
  const website = form.watch('website_url');
  const derivedDomain = useMemo(() => deriveDomain(website), [website]);

  // Seed the editable review lists once each section lands. Guarded on length
  // so re-renders never clobber the user's selections mid-review.
  const { state: discoveryState } = discovery;
  useEffect(() => {
    if (discoveryState.domains.status === 'done') {
      setDomains((prev) =>
        prev.length > 0
          ? prev
          : discoveryState.domains.data.map((domain) => ({ domain, selected: true })),
      );
    }
  }, [discoveryState.domains]);

  useEffect(() => {
    if (discoveryState.competitors.status === 'done') {
      setCompetitors((prev) =>
        prev.length > 0
          ? prev
          : discoveryState.competitors.data.map((c) => ({ ...c, selected: true })),
      );
    }
  }, [discoveryState.competitors]);

  useEffect(() => {
    if (discoveryState.prompts.status === 'done') {
      setPrompts((prev) =>
        prev.length > 0 ? prev : discoveryState.prompts.data.map((p) => ({ ...p, selected: true })),
      );
    }
  }, [discoveryState.prompts]);

  const confirm = useMutation({
    mutationFn: async () => {
      if (!brand) throw new Error('Brand details are missing.');
      const project = await projectsApi.createProject(
        onboardingToProjectInput(brand, competitors, domains),
      );

      const chosen = prompts.filter((p) => p.selected);
      if (chosen.length > 0) {
        const set = await promptsApi.createPromptSet({
          project_id: project.id,
          name: 'Starting prompts',
        });
        // Sequential rather than Promise.all: these are writes against one set,
        // and a burst of parallel creates is a good way to trip rate limits for
        // no benefit on a list this size.
        for (const prompt of chosen) {
          await promptsApi.createPrompt(set.id, {
            text: prompt.text,
            // Backend theme is a non-null `str = ""` — send empty, never null.
            theme: prompt.theme ?? '',
            intent: normalizeIntent(prompt.intent),
            branded: false,
            enabled: true,
          });
        }
      }
      return project;
    },
    onSuccess: async (project) => {
      setActiveProjectId(project.id);
      // Await the refetch before navigating. The gate reads the projects query;
      // if it is still holding the stale empty list when /visibility mounts, it
      // bounces the user straight back here.
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      router.replace('/visibility');
    },
  });

  const submitBrand = form.handleSubmit((values) => {
    setBrand(values);
    setStep(1);
  });

  const toggle = useCallback(
    <T extends { selected: boolean }>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      (index: number) =>
        setter((prev) =>
          prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)),
        ),
    [],
  );

  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <main className="flex min-h-dvh flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center gap-2.5">
          <LogoCube size={26} />
          <span className="text-foreground text-lg font-semibold tracking-tight">Searchify</span>
        </header>

        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center py-10">
          <ol className="mb-8 flex list-none items-center gap-2 p-0">
            {STEPS.map((label, index) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={
                    index <= step
                      ? 'bg-accent h-0.5 flex-1 rounded-full'
                      : 'bg-border h-0.5 flex-1 rounded-full'
                  }
                />
              </li>
            ))}
          </ol>

          <p className="text-muted text-2xs mb-2 font-medium tracking-wider uppercase">
            Step {step + 1} of {STEPS.length}
          </p>

          {step === 0 ? (
            <form noValidate onSubmit={submitBrand} className="grid gap-5">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                {isAdditional ? 'Add a project' : 'What brand are we tracking?'}
              </h1>

              <Field label="Brand name" required error={form.formState.errors.brand_name?.message}>
                {(props) => (
                  <Input {...props} {...form.register('brand_name')} placeholder="Acme" />
                )}
              </Field>

              <Field
                label="Website"
                required
                error={form.formState.errors.website_url?.message}
                hint={derivedDomain ? `We'll track ${derivedDomain}` : undefined}
              >
                {(props) => (
                  <Input {...props} {...form.register('website_url')} placeholder="acme.com" />
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Country" error={form.formState.errors.country_code?.message}>
                  {(props) => (
                    <Controller
                      control={form.control}
                      name="country_code"
                      render={({ field }) => (
                        <MarketSelect
                          {...props}
                          ariaLabel="Country"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          options={COUNTRY_OPTIONS}
                        />
                      )}
                    />
                  )}
                </Field>
                <Field label="Language" error={form.formState.errors.language_code?.message}>
                  {(props) => (
                    <Controller
                      control={form.control}
                      name="language_code"
                      render={({ field }) => (
                        <MarketSelect
                          {...props}
                          ariaLabel="Language"
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          options={LANGUAGE_OPTIONS}
                        />
                      )}
                    />
                  )}
                </Field>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit">Continue</Button>
                {isAdditional ? (
                  <Button type="button" variant="ghost" onClick={() => router.push('/projects')}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                Finding what to track
              </h1>

              <DiscoveryProgress state={discovery.state} onRetry={discovery.retry} />

              {discovery.agentUnconfigured ? (
                <Alert tone="warning">
                  AI discovery is unavailable. You can continue and add competitors and prompts
                  yourself.
                </Alert>
              ) : null}

              <div className="flex items-center gap-2">
                <Button onClick={() => setStep(2)} disabled={discovery.isRunning}>
                  {discovery.isRunning ? 'Searching…' : 'Review'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                Does this look right?
              </h1>

              <ReviewStep
                domains={domains}
                competitors={competitors}
                prompts={prompts}
                onToggleDomain={toggle(setDomains)}
                onToggleCompetitor={toggle(setCompetitors)}
                onTogglePrompt={toggle(setPrompts)}
                onRenameCompetitor={(index, name) =>
                  setCompetitors((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, name } : item)),
                  )
                }
                onAddCompetitor={() =>
                  setCompetitors((prev) => [...prev, { name: '', domains: [], selected: true }])
                }
              />

              {confirm.isError ? (
                <Alert tone="danger">{onboardingErrorMessage(confirm.error)}</Alert>
              ) : null}

              <div className="flex items-center gap-2">
                <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                  {confirm.isPending ? 'Creating…' : 'Create project'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(1)} disabled={confirm.isPending}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <PreviewPanel
        brandName={form.watch('brand_name')}
        domain={derivedDomain}
        domains={domains}
        competitors={competitors}
        prompts={prompts}
        step={step}
      />
    </div>
  );
}
