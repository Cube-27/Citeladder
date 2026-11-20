import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { projectMutations, projectQueries } from '@/lib/api/projects';
import {
  businessDraft,
  mapChanges,
  profileChanges,
  type BusinessDraft,
} from '@/lib/prompts/builder-business';

/**
 * The business facts' edit state, shared by the Prompt Builder's first step
 * and Agent › Context › Business map: the saved brand profile and business
 * map as a draft, and one save that writes each owner only what changed or
 * was accepted — the profile first, so the map never names an offering the
 * profile does not list yet.
 */
export function useBusinessDraft({
  projectId,
  workspaceId,
}: Readonly<{ projectId: string; workspaceId: string }>) {
  const scope = { workspaceId, projectId };
  const profileQuery = useQuery(projectQueries.brandProfile(scope));
  const mapQuery = useQuery(projectQueries.businessMap(scope));
  const saved = useMemo(
    () =>
      profileQuery.data && mapQuery.data ? businessDraft(profileQuery.data, mapQuery.data) : null,
    [profileQuery.data, mapQuery.data],
  );
  const [edited, setEdited] = useState<BusinessDraft | null>(null);
  const draft = edited ?? saved;
  const profileUpdate = edited && saved ? profileChanges(edited, saved) : {};
  const mapUpdate = edited && saved ? mapChanges(edited, saved) : null;
  const dirty = Object.keys(profileUpdate).length > 0 || mapUpdate !== null;

  const saveBusiness = useMutation(projectMutations.saveBusiness(scope));
  const save = {
    isPending: saveBusiness.isPending,
    error: saveBusiness.error,
    /** Write what changed; the draft becomes the saved state once both owners land. */
    mutateAsync: () =>
      saveBusiness.mutateAsync(
        { profile: Object.keys(profileUpdate).length ? profileUpdate : null, map: mapUpdate },
        { onSuccess: () => setEdited(null) },
      ),
  };

  const retry = () => {
    if (profileQuery.isError) void profileQuery.refetch();
    if (mapQuery.isError) void mapQuery.refetch();
  };
  return {
    profile: profileQuery.data,
    map: mapQuery.data,
    loading: profileQuery.isPending || mapQuery.isPending,
    loadError: profileQuery.error ?? mapQuery.error,
    retry,
    retrying: profileQuery.isFetching || mapQuery.isFetching,
    draft,
    setDraft: setEdited,
    /** Drops every unsaved edit. */
    discard: () => setEdited(null),
    dirty,
    save,
  };
}
export type BusinessDraftState = ReturnType<typeof useBusinessDraft>;
