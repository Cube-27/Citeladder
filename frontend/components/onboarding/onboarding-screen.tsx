'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/ui/logo-mark';
import { MarketSelect } from '@/components/ui/market-select';
import { queryKeys } from '@/lib/api/query-keys';
import { projectsApi } from '@/lib/api/projects';
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
import { ReviewStep } from './review-step';

/**
 * Onboarding — the only way a project gets created (plan.md §10, decision 11;
 * `/setup` is retired).
 *
 * Four steps: Brand → Discovery → Review → Finish. Discovery fires all three suggestion
 * calls automatically on entry; there is no Generate button, because discovery
 * is the reason the screen exists.
 *
 * Second project onward (`?new=1`) runs the identical flow — the discovery is
 * the value, not a first-run formality — with two differences: the copy drops
 * the welcome framing, and Cancel returns to `/projects` instead of leaving the
 * user nowhere.
 */
const STEPS = ['Brand', 'Discovery', 'Review', 'Finish'] as const;
type StepIndex = 0 | 1 | 2 | 3;

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
  const [createdProjectName, setCreatedProjectName] = useState<string | null>(null);
  const [createdProgress, setCreatedProgress] = useState<OnboardingProgress>({});

  const form = useForm<BrandStepValues>({
    resolver: zodResolver(brandStepSchema),
    defaultValues: emptyBrandStep,
  });

  const discovery = useDiscovery(step >= 1 ? brand : null);
  const websiteUrl = useWatch({ control: form.control, name: 'website_url' });
  const derivedDomain = deriveDomain(websiteUrl);

  // Seed the editable review lists once each section lands. Guarded on length
  // so re-renders never clobber the user's selections mid-review.
  const { state: discoveryState } = discovery;
  useEffect(() => {
    if (discoveryState.domains.status === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed editable state from a completed discovery result.
      setDomains((prev) =>
        prev.length > 0
          ? prev
          : discoveryState.domains.data.map((domain) => ({ domain, selected: true })),
      );
    }
  }, [discoveryState.domains]);

  useEffect(() => {
    if (discoveryState.competitors.status === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed editable state from a completed discovery result.
      setCompetitors((prev) =>
        prev.length > 0
          ? prev
          : discoveryState.competitors.data.map((c) => ({ ...c, selected: true })),
      );
    }
  }, [discoveryState.competitors]);

  useEffect(() => {
    if (discoveryState.prompts.status === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed editable state from a completed discovery result.
      setPrompts((prev) =>
        prev.length > 0 ? prev : discoveryState.prompts.data.map((p) => ({ ...p, selected: true })),
      );
    }
  }, [discoveryState.prompts]);

  // Survives a failed confirm so "Create project" retries the writes that failed
  // instead of creating a second project. Cleared only when the brand changes
  // (see submitBrand) — that is a different project, not a retry.
  const confirm = useMutation({
    mutationFn: () => {
      if (!brand) throw new Error('Brand details are missing.');
      return createProjectFromOnboarding({
        brand,
        competitors,
        domains,
        prompts,
        progress: createdProgress,
      });
    },
    onSuccess: async (project) => {
      setActiveProjectId(project.id);
      // Logo hydration is best-effort and never blocks onboarding. The backend
      // checks its database cache before crawling; once it finishes, refresh
      // the project list so every shared BrandLogo instance updates together.
      void projectsApi
        .refreshProjectLogos(project.id)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }))
        .catch(() => undefined);
      // Refresh before showing the completion screen, so the dashboard is ready
      // as soon as the user leaves onboarding.
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
      setCreatedProjectName(project.name);
      setStep(3);
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
      setCreatedProgress({});
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
    <div className="relative flex min-h-dvh flex-col bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 size-[500px] rounded-full bg-indigo-200/40 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 size-[500px] rounded-full bg-sky-200/40 blur-[120px]" />
      </div>

      <header className="border-b border-slate-200 bg-white px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-mkt-display text-lg font-bold text-slate-900">
              Searchify
            </span>
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200/60">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-8 pb-20 sm:px-10">
        {/* Labelled stepper with smooth progress bar */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <ol className="grid list-none grid-cols-4 gap-3 p-0">
            {STEPS.map((label, index) => {
              const state = index < step ? 'done' : index === step ? 'current' : 'upcoming';
              return (
                <li
                  key={label}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="grid gap-2"
                >
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      state === 'done'
                        ? 'bg-emerald-500'
                        : state === 'current'
                          ? 'bg-indigo-600'
                          : 'bg-slate-200',
                    )}
                  />
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-2xs font-bold uppercase',
                        state === 'current'
                          ? 'text-indigo-600'
                          : state === 'done'
                            ? 'text-emerald-600'
                            : 'text-slate-400',
                      )}
                    >
                      {label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Step Content Container */}
        <div className="relative rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 shadow-card transition-all">
          {step === 0 ? (
            <form noValidate onSubmit={submitBrand} className="grid gap-6">
              <div className="grid gap-1.5">
                <h1 className="font-mkt-display text-2xl font-bold text-slate-900 sm:text-3xl">
                  {isAdditional ? 'Add a project' : 'What brand are we tracking?'}
                </h1>
                <p className="text-sm text-slate-500">
                  We&apos;ll discover your domains, competitors and starting prompts from this.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Brand name" required error={form.formState.errors.brand_name?.message}>
                  {(props) => (
                    <Input
                      {...props}
                      {...form.register('brand_name')}
                      placeholder="Acme"
                      className="bg-slate-50/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                    />
                  )}
                </Field>

                <Field
                  label="Website"
                  required
                  error={form.formState.errors.website_url?.message}
                  hint={derivedDomain ? `We'll track ${derivedDomain}` : undefined}
                >
                  {(props) => (
                    <Input
                      {...props}
                      {...form.register('website_url')}
                      placeholder="acme.com"
                      className="bg-slate-50/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                    />
                  )}
                </Field>

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

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" className="font-semibold">
                  Continue
                </Button>
                {isAdditional ? (
                  <Button type="button" variant="ghost" onClick={() => router.push('/projects')}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-6">
              <div className="grid gap-1.5">
                <h1 className="font-mkt-display text-2xl font-bold text-slate-900 sm:text-3xl">
                  Finding what to track
                </h1>
                <p className="text-sm text-slate-500">
                  Three searches run in parallel for {brand?.brand_name || 'your brand'}.
                </p>
              </div>

              <DiscoveryProgress state={discovery.state} onRetry={discovery.retry} />

              {discovery.agentUnconfigured ? (
                <Alert tone="warning">
                  AI discovery is unavailable. You can continue and add competitors and prompts
                  yourself.
                </Alert>
              ) : null}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => setStep(2)}
                  disabled={discovery.isRunning}
                  className="font-semibold"
                >
                  {discovery.isRunning ? 'Searching…' : 'Review'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-6">
              <div className="grid gap-1.5">
                <h1 className="font-mkt-display text-2xl font-bold text-slate-900 sm:text-3xl">
                  Does this look right?
                </h1>
                <p className="text-sm text-slate-500">
                  Deselect anything you don&apos;t want — you can change all of it after setup.
                </p>
              </div>

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

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => confirm.mutate()}
                  disabled={confirm.isPending}
                  className="font-semibold"
                >
                  {confirm.isPending ? 'Creating…' : 'Create project'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(1)} disabled={confirm.isPending}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid max-w-xl gap-6">
              <div className="grid gap-2">
                <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-2">
                  <span className="text-xl">✨</span>
                </div>
                <h1 className="font-mkt-display text-2xl font-bold text-slate-900 sm:text-3xl">
                  Your workspace is ready
                </h1>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {createdProjectName ?? 'Your project'} is set up. We&apos;ve queued a free Site
                  Health crawl in the background; its status and results will appear on your
                  dashboard.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  onClick={() => router.replace('/projects')}
                  className="font-semibold"
                >
                  Open dashboard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
