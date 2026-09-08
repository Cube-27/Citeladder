import { CheckCircle2, LineChart, Search, Sparkles } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { cn } from '@/lib/utils';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILE_INKS, LANDING_TILES } from './landing-icons';

/**
 * Visual graphic viewports inside each workflow stage card.
 * Modeled after high-end AI product cards (Jasper, Linear, Raycast) with
 * technical grid backdrops, real evidence mockups, and vibrant thematic accents.
 */
function StepPreview({ index, tileInk }: Readonly<{ index: number; tileInk: string }>) {
  if (index === 0) {
    return (
      <div className="border-border-subtle/70 bg-panel/85 relative my-4 flex min-h-28 flex-col justify-between overflow-hidden rounded-[var(--radius-control)] border p-3.5 shadow-xs backdrop-blur-xs">
        <div aria-hidden className="preview-grid pointer-events-none absolute inset-0" />
        <IllustrativeLabel />
        <div className="border-border-subtle/80 bg-background/90 relative z-1 flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs shadow-2xs">
          <Search className={cn('size-3 shrink-0', tileInk)} aria-hidden />
          <span className="text-preview-caption text-muted truncate font-mono">
            &quot;Who leads enterprise AEO?&quot;
          </span>
        </div>
        <div className="text-preview-caption relative z-1 mt-3 flex items-center justify-between">
          <div className="text-muted flex items-center gap-1.5 font-medium">
            <span className="bg-preview-success-dot size-2 animate-pulse rounded-full" />
            <span>4 engines polled</span>
          </div>
          <span className="text-accent-text font-semibold">+5 Citations</span>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="border-border-subtle/70 bg-panel/85 relative my-4 flex min-h-28 flex-col justify-between overflow-hidden rounded-[var(--radius-control)] border p-3.5 shadow-xs backdrop-blur-xs">
        <div aria-hidden className="preview-grid pointer-events-none absolute inset-0" />
        <IllustrativeLabel />
        <div className="relative z-1">
          <div className="text-preview-caption mb-1.5 flex items-center justify-between">
            <span className="text-muted font-medium">Citation share</span>
            <span className="text-foreground font-mono font-bold">68%</span>
          </div>
          <div className="border-border-subtle/60 bg-background flex h-2 w-full overflow-hidden rounded-full border">
            <div className="bg-accent h-full w-[var(--workflow-share-yours)] transition-all duration-500" />
            <div className="bg-border-strong h-full w-[var(--workflow-share-competitors)]" />
            <div className="bg-border h-full w-[var(--workflow-share-none)]" />
          </div>
        </div>
        <div className="text-preview-caption text-muted relative z-1 mt-2.5 flex items-center gap-1.5 font-medium">
          <Sparkles className="size-3 text-amber-500" aria-hidden />
          <span>3 high-value opportunity gaps</span>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="border-border-subtle/70 bg-panel/85 relative my-4 flex min-h-28 flex-col justify-between overflow-hidden rounded-[var(--radius-control)] border p-3.5 shadow-xs backdrop-blur-xs">
        <div aria-hidden className="preview-grid pointer-events-none absolute inset-0" />
        <IllustrativeLabel />
        <div className="text-preview-caption relative z-1 flex items-center justify-between">
          <span className="text-muted font-mono text-xs font-medium">brief_update.md</span>
          <span className="text-preview-status text-preview-success font-semibold uppercase">
            Ready
          </span>
        </div>
        <div className="text-preview-code border-border-subtle/70 bg-background/90 relative z-1 mt-2 space-y-1 rounded-[var(--radius-control)] border p-2 font-mono">
          <div className="text-muted/60 truncate line-through">- Unstructured company claim</div>
          <div className="text-preview-success-strong truncate font-semibold">
            + Grounded schema fact trail
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border-subtle/70 bg-panel/85 relative my-4 flex min-h-28 flex-col justify-between overflow-hidden rounded-[var(--radius-control)] border p-3.5 shadow-xs backdrop-blur-xs">
      <div aria-hidden className="preview-grid pointer-events-none absolute inset-0" />
      <IllustrativeLabel />
      <div className="text-preview-caption relative z-1 flex items-center justify-between">
        <span className="text-muted font-medium">Audit accuracy</span>
        <span className="text-preview-success flex items-center gap-1 font-semibold">
          <CheckCircle2 className="size-3" aria-hidden />
          Verified
        </span>
      </div>
      <div className="relative z-1 mt-2 flex items-baseline justify-between">
        <span className="text-foreground font-mono text-2xl font-bold tracking-tight">99.4%</span>
        <span className="text-preview-success flex items-center gap-0.5 text-xs font-semibold">
          <LineChart className="size-3" aria-hidden />
          +14% share
        </span>
      </div>
    </div>
  );
}

function IllustrativeLabel() {
  return (
    <span className="text-preview-caption text-muted relative z-1 font-medium">
      Illustrative example
    </span>
  );
}

/**
 * The operating loop — four steps as full vibrant editorial panels.
 * Features large display headings, interactive blueprint graphics, and
 * rich luminous backgrounds that pop off a clean white ground.
 */
export function Workflow() {
  const { workflow } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" tone="paper" rhythm="base" aria-labelledby="workflow-title">
      <SectionHeader title={workflow.title} lead={workflow.lead} headingId="workflow-title" />
      <StaggerGroup className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {workflow.steps.map((step, index) => {
          const Icon = LANDING_ICONS[step.icon];
          const stepNumber = String(index + 1).padStart(2, '0');
          const tileInk = LANDING_TILE_INKS[step.tile];
          return (
            <StaggerItem key={step.stage} className="h-full">
              <article
                className={cn(
                  'border-border-subtle/80 relative flex h-full flex-col justify-between rounded-[var(--radius-card)] border p-6 sm:p-7 shadow-xs transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-card',
                  LANDING_TILES[step.tile],
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="bg-panel flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] shadow-xs">
                      <Icon className={cn('size-4.5', tileInk)} aria-hidden />
                    </span>
                    <span className="text-preview-caption border-border-subtle/80 bg-panel/80 text-muted rounded-full border px-2.5 py-0.5 font-mono font-semibold tabular-nums shadow-2xs">
                      {stepNumber}
                    </span>
                  </div>
                  <span className="website-label text-muted mt-4 block tracking-wider uppercase">
                    {step.stage}
                  </span>
                  <h3 className="website-feature-heading text-foreground mt-1.5 font-bold tracking-tight text-balance">
                    {step.label}
                  </h3>

                  {/* Visual graphic preview frame on grid */}
                  <StepPreview index={index} tileInk={tileInk} />

                  <p className="website-body text-secondary max-w-[42ch] leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
