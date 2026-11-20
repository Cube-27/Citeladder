import { ProviderList } from '@/components/providers/provider-list';
import { SettingsGroup } from '@/components/ui/setting-row';

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
    <SettingsGroup title="Measurement providers">
      <ProviderList framed />
    </SettingsGroup>
  );
}
