'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Sparkles } from 'lucide-react';
import { useReducer } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import {
  projectsApi,
  type BrandProfileField,
  type BrandProfileUpdateInput,
} from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { BrandProfile, BrandProfileDraft, BrandProfileSuggestion } from '@/lib/api/types';
import { formErrorMessage } from '@/lib/forms/error-message';

import { GenerateBrandDialog } from './generate-brand-dialog';

const profileFields = [
  'description',
  'positioning',
  'products_services',
  'target_audience',
] as const satisfies readonly BrandProfileField[];

function profileDraft(profile: BrandProfile): BrandProfileDraft {
  return {
    description: profile.description,
    positioning: profile.positioning,
    products_services: profile.products_services,
    target_audience: profile.target_audience,
  };
}

function sameValue(
  left: BrandProfileDraft[BrandProfileField],
  right: BrandProfileDraft[BrandProfileField],
) {
  return Array.isArray(left) && Array.isArray(right)
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;
}

function hasValue(value: BrandProfileDraft[BrandProfileField]) {
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

function parseProductsInput(value: string): string[] {
  return value.split(',').flatMap((item) => {
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

type EditorState = {
  draft: BrandProfileDraft;
  productsInput: string;
  suggestion: BrandProfileSuggestion | null;
  suggestOpen: boolean;
  notice: string | null;
};

type EditorAction =
  | { type: 'patch'; patch: Partial<EditorState> }
  | { type: 'stored'; profile: BrandProfile; notice: string }
  | {
      type: 'suggested';
      suggestion: BrandProfileSuggestion;
      draft: BrandProfileDraft;
      notice: string;
    }
  | { type: 'discard'; profile: BrandProfile };

function initialEditorState(profile: BrandProfile): EditorState {
  return {
    draft: profileDraft(profile),
    productsInput: profile.products_services.join(', '),
    suggestion: null,
    suggestOpen: false,
    notice: null,
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'stored':
      return {
        ...state,
        draft: profileDraft(action.profile),
        productsInput: action.profile.products_services.join(', '),
        suggestion: null,
        notice: action.notice,
      };
    case 'suggested':
      return {
        ...state,
        draft: action.draft,
        productsInput: action.draft.products_services.join(', '),
        suggestion: action.suggestion,
        suggestOpen: false,
        notice: action.notice,
      };
    case 'discard':
      return initialEditorState(action.profile);
  }
}

export function BrandProfilePanel({
  projectId,
  profile,
}: Readonly<{
  projectId: string;
  profile: BrandProfile;
}>) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(editorReducer, profile, initialEditorState);
  const { draft, productsInput, suggestion, suggestOpen, notice } = state;

  const storeProfile = (next: BrandProfile, notice: string) => {
    queryClient.setQueryData(queryKeys.projects.brandProfile(projectId), next);
    dispatch({ type: 'stored', profile: next, notice });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      projectsApi.updateBrandProfile(projectId, {
        ...draft,
        products_services: parseProductsInput(productsInput),
      }),
    onSuccess: (next) => {
      storeProfile(next, 'Brand knowledge saved. These details now inform assisted features.');
    },
  });

  const suggestMutation = useMutation({
    mutationFn: () => projectsApi.suggestBrandProfile(projectId),
    onSuccess: (next) => {
      const mergedDraft: BrandProfileDraft = {
        description: next.draft.description || draft.description,
        positioning: next.draft.positioning || draft.positioning,
        products_services:
          next.draft.products_services.length > 0
            ? next.draft.products_services
            : parseProductsInput(productsInput),
        target_audience: next.draft.target_audience || draft.target_audience,
      };
      dispatch({
        type: 'suggested',
        suggestion: next,
        draft: mergedDraft,
        notice: 'AI draft loaded for review. Edit anything before applying it.',
      });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => {
      if (!suggestion) throw new Error('No AI draft is awaiting review.');
      const currentDraft: BrandProfileDraft = {
        ...draft,
        products_services: parseProductsInput(productsInput),
      };
      const acceptedFields: BrandProfileField[] = [];
      const manualOverrides: BrandProfileUpdateInput = {};
      for (const field of profileFields) {
        const current = currentDraft[field];
        const suggested = suggestion.draft[field];
        if (sameValue(current, suggested) && hasValue(current)) {
          acceptedFields.push(field);
        } else {
          Object.assign(manualOverrides, { [field]: current });
        }
      }
      return projectsApi.acceptBrandProfileSuggestion(projectId, suggestion.id, {
        accepted_fields: acceptedFields,
        manual_overrides: manualOverrides,
      });
    },
    onSuccess: (result) => {
      storeProfile(
        result.profile,
        result.skipped_manual_fields.length > 0
          ? `Applied the draft; preserved manual fields: ${result.skipped_manual_fields.join(', ')}.`
          : 'Reviewed AI draft applied to the brand knowledge base.',
      );
    },
  });

  const pendingError = saveMutation.error ?? acceptMutation.error;
  const profileMutationPending = saveMutation.isPending || acceptMutation.isPending;

  return (
    <Card aria-labelledby="brand-knowledge-title">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardEyebrow>Brand profile</CardEyebrow>
          <CardTitle id="brand-knowledge-title">Facts & positioning</CardTitle>
          <p className="text-secondary text-sm">
            Curated positioning and audience context used by competitor and prompt generation.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'patch', patch: { suggestOpen: true } })}
          disabled={profileMutationPending}
        >
          <Sparkles className="size-4" aria-hidden />
          Draft with AI
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {pendingError ? <Alert tone="danger">{formErrorMessage(pendingError)}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {suggestion ? (
          <Alert tone="info">
            Reviewing AI draft from {suggestion.model_identity.transport_model ?? 'default agent'}.
            Unchanged fields retain AI provenance; edits are saved as manual.
          </Alert>
        ) : null}

        {/* Editable profile fields */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Description" hint="Core mission, value proposition, and brand summary.">
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                disabled={profileMutationPending}
                value={draft.description}
                onChange={(event) =>
                  dispatch({
                    type: 'patch',
                    patch: { draft: { ...draft, description: event.target.value } },
                  })
                }
              />
            )}
          </Field>
          <Field
            label="Positioning"
            hint="Include price tier, differentiation, and competitive segment."
          >
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                disabled={profileMutationPending}
                value={draft.positioning}
                onChange={(event) =>
                  dispatch({
                    type: 'patch',
                    patch: { draft: { ...draft, positioning: event.target.value } },
                  })
                }
              />
            )}
          </Field>
          <Field
            label="Target audience"
            hint="Key demographics, customer personas, and ideal buyers."
          >
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                disabled={profileMutationPending}
                value={draft.target_audience}
                onChange={(event) =>
                  dispatch({
                    type: 'patch',
                    patch: { draft: { ...draft, target_audience: event.target.value } },
                  })
                }
              />
            )}
          </Field>
          <Field label="Products and services" hint="Comma-separated category labels.">
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                disabled={profileMutationPending}
                value={productsInput}
                onChange={(event) =>
                  dispatch({ type: 'patch', patch: { productsInput: event.target.value } })
                }
              />
            )}
          </Field>
        </div>

        <div className="flex justify-end gap-2">
          {suggestion ? (
            <>
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: 'discard', profile })}
                disabled={profileMutationPending}
              >
                Discard draft
              </Button>
              <Button
                variant="primary"
                onClick={() => acceptMutation.mutate()}
                disabled={profileMutationPending}
              >
                <Sparkles className="size-4" aria-hidden />
                {acceptMutation.isPending ? 'Applying…' : 'Apply reviewed draft'}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={profileMutationPending}
            >
              <Save className="size-4" aria-hidden />
              {saveMutation.isPending ? 'Saving…' : 'Save brand knowledge'}
            </Button>
          )}
        </div>
      </CardContent>

      <GenerateBrandDialog
        open={suggestOpen}
        onOpenChange={(open) => dispatch({ type: 'patch', patch: { suggestOpen: open } })}
        title="Draft brand knowledge with AI"
        description="The default agent will draft positioning, products, and audience context for you to review. Nothing is applied automatically."
        onGenerate={async () => {
          await suggestMutation.mutateAsync();
        }}
        isGenerating={suggestMutation.isPending}
        error={suggestMutation.error}
      />
    </Card>
  );
}
