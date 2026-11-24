import { Absence } from '@/components/ui/absence';

export function scoreUnavailableState(state: string | undefined, reason?: string) {
  if (state === 'excluded') return <Absence state="not_applicable" label="Excluded" />;
  if (reason === 'unsupported_purpose_checklist') {
    return <Absence state="not_applicable" label="No AEO checklist for this page kind" />;
  }
  return <Absence state="not_measured" />;
}
