import {
  BarChart3,
  CheckCircle2,
  CircleCheck,
  FileText,
  LineChart,
  Pencil,
  Search,
  Sparkles,
} from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
const STAGE_ICONS = {
  Collect: FileText,
  Prioritize: BarChart3,
  Improve: Pencil,
  Verify: CircleCheck,
} as const;

/**
 * Visual graphic viewports inside each workflow stage card.
 * Modeled after high-end AI product cards (Jasper, Linear, Raycast) with
 * technical grid backdrops, real evidence mockups, and vibrant thematic accents.
 */
function StepPreview({ index }: Readonly<{ index: number }>) {
  if (index === 0) {
    return (
      <div className="border-border-subtle/70 bg-panel/85 relative my-4 flex min-h-28 flex-col justify-between overflow-hidden rounded-[var(--radius-control)] border p-3.5 shadow-xs backdrop-blur-xs">
        <div aria-hidden className="preview-grid pointer-events-none absolute inset-0" />
        <IllustrativeLabel />
        <div className="border-border-subtle/80 bg-background/90 relative z-1 flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs shadow-2xs">
          <Search className="text-accent size-3 shrink-0" aria-hidden />
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

/** Four workflow stages retain their existing illustrative product previews. */
export function Workflow() {
  const { workflow } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" tone="sunken" rhythm="base" aria-labelledby="workflow-title">
      <SectionHeader title={workflow.title} lead={workflow.lead} headingId="workflow-title" />
      <StaggerGroup className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {workflow.steps.map((step, index) => {
          const Icon = STAGE_ICONS[step.stage];
          return (
            <StaggerItem key={step.stage} className="h-full">
              <article className="border-border-subtle flex h-full flex-col gap-3 border-t pt-4">
                <div className="website-label flex items-center gap-2">
                  <Icon className="text-accent size-4" aria-hidden />
                  <span>{step.stage}</span>
                  <span className="ms-auto" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="website-feature-heading">{step.label}</h3>
                <div className="app-type-scale">
                  <StepPreview index={index} />
                </div>
                <p className="website-body max-w-[42ch]">{step.desc}</p>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
