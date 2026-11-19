import { ProviderList } from '@/components/providers/provider-list';
import { SectionContent, TitledSection } from '@/components/ui/section';

/**
 * BYOK Provider Settings panel, rendered inside the Settings screen's
 * "Providers" tab.
 *
 * Measurement credentials come first as one list row per provider — a
 * DataForSEO login is entered once and serves every consumer-app and search
 * surface. The Agent always runs on the platform model.
 */
export function ProviderSettings() {
  return (
    <TitledSection title="Measurement providers">
      <SectionContent>
        <ProviderList />
      </SectionContent>
    </TitledSection>
  );
}
