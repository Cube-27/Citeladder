'use client';

import type { GrantFamily, GrantModel } from '@/components/settings/grant-model';
import { IntegrationCardView } from '@/components/settings/integration-card-view';

/**
 * Per-grant integration card. Connection state and API orchestration live in
 * `IntegrationConnectionRow`; card markup lives in `integration-card-view`.
 */
export function IntegrationCard({
  workspaceId,
  family,
  grant,
}: Readonly<{ workspaceId: string; family: GrantFamily; grant: GrantModel | null }>) {
  return <IntegrationCardView workspaceId={workspaceId} family={family} grant={grant} />;
}
