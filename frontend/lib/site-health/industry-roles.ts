const ABSTENTION_LABELS: Readonly<Record<string, string>> = {
  no_signal: 'No role signals on this page',
  schema_only: 'Only schema markup matched — no visible evidence',
  below_minimum_score: 'Signals too weak to assign a role',
  ambiguous_margin: 'Two roles scored too closely to separate',
  not_applicable: 'Not applicable to this corpus item',
  pack_not_eligible: 'Active pack does not cover this page',
  invalid_input: 'Page facts were unusable for classification',
};

export function abstentionLabel(reason: string | null | undefined): string {
  if (!reason) return 'Unclassified';
  return ABSTENTION_LABELS[reason] ?? 'Unclassified';
}

/** Preserve the pack-defined namespace until the API supplies reviewed display labels. */
export function industryRoleLabel(roleId: string): string {
  return roleId;
}
