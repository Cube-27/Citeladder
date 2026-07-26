'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/ui/logo-mark';
import { MarketSelect } from '@/components/ui/market-select';
import { queryKeys } from '@/lib/api/query-keys';
import {
  brandStepSchema,
  deriveDomain,
  emptyBrandStep,
  onboardingErrorMessage,
  type BrandStepValues,
  type ReviewCompetitor,
  type ReviewDomain,
  type ReviewPrompt,
} from '@/lib/onboarding/forms';
import {
  createProjectFromOnboarding,
  type OnboardingProgress,
} from '@/lib/onboarding/create-project';
import { useDiscovery } from '@/lib/onboarding/use-discovery';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
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
  // Not memoized: `watch()` is not a stable dependency, and deriveDomain is a
  // URL parse on one short string — cheaper than the memo bookkeeping.
  const derivedDomain = deriveDomain(form.watch('website_url'));

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

  // Survives a failed confirm so "Create project" retries the writes that failed
  // instead of creating a second project. Cleared only when the brand changes
  // (see submitBrand) — that is a different project, not a retry.
  const createdProgress = useRef<OnboardingProgress>({});

  const confirm = useMutation({
    mutationFn: () => {
      if (!brand) throw new Error('Brand details are missing.');
      return createProjectFromOnboarding({
        brand,
        competitors,
        domains,
        prompts,
        progress: createdProgress.current,
      });
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
    // Correcting the brand starts a NEW discovery run, so the review lists must
    // be emptied first: the seeding effects bail out when `prev.length > 0` and
    // would otherwise leave the previous brand's results standing in front of
    // the new ones. Keyed on the same brand_name|website_url pair useDiscovery
    // re-fires on — Back → Continue with the values unchanged re-runs nothing,
    // so clearing there would blank the review step for good.
    const rediscovers =
      brand !== null &&
      (brand.brand_name !== values.brand_name || brand.website_url !== values.website_url);
    if (rediscovers) {
      setDomains([]);
      setCompetitors([]);
      setPrompts([]);
      // A different brand is a fresh creation, not a retry of the last confirm.
      createdProgress.current = {};
    }
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
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-foreground text-lg font-semibold tracking-tight">Searchify</span>
          </span>
          <span className="text-subtle text-xs">
            Step {step + 1} of {STEPS.length}
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center py-10">
          {/* Labelled stepper. The bars alone said "three of something" without
              saying what, so the user could not tell what was coming — which is
              most of what a stepper is for. `aria-current` marks the active step
              rather than relying on colour. */}
          <ol className="mb-8 grid list-none grid-cols-3 gap-2 p-0">
            {STEPS.map((label, index) => {
              const state = index < step ? 'done' : index === step ? 'current' : 'upcoming';
              return (
                <li
                  key={label}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="grid gap-1.5"
                >
                  <span
                    className={cn(
                      'h-0.5 rounded-full',
                      state === 'upcoming' ? 'bg-border' : 'bg-accent',
                    )}
                  />
                  <span
                    className={cn(
                      'text-2xs font-medium',
                      state === 'current' ? 'text-foreground' : 'text-subtle',
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

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
