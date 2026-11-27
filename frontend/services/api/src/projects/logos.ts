import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { REVALIDATE_CACHE_CONTROL } from '../http/revalidate.ts';
import type { ProjectScope } from './brand-profile.ts';

const { status_ready: READY } = policy.brand_logos;

export function brandLogoUrl(projectId: string): string {
  return `${policy.api.prefix}/projects/${projectId}/logo`;
}

export function competitorLogoUrl(projectId: string, competitorId: string): string {
  return `${policy.api.prefix}/projects/${projectId}/competitors/${competitorId}/logo`;
}

export async function logoResponse(
  db: Database,
  request: { scope: ProjectScope; competitorId: string | null; ifNoneMatch: string | undefined },
): Promise<Response> {
  const { scope, competitorId } = request;
  const owner =
    competitorId === null
      ? db
          .selectFrom('brands as owner')
          .innerJoin('projects', 'projects.id', 'owner.project_id')
          .where('projects.id', '=', scope.projectId)
      : db
          .selectFrom('competitors as owner')
          .innerJoin('projects', 'projects.id', 'owner.project_id')
          .where('projects.id', '=', scope.projectId)
          .where('owner.id', '=', competitorId);
  const ready = owner
    .innerJoin('brand_logo_assets as asset', 'asset.id', 'owner.logo_asset_id')
    .where('projects.workspace_id', '=', scope.workspaceId)
    .where('asset.status', '=', READY)
    .where('asset.image_data', 'is not', null);
  const asset = await ready.select(['asset.content_type', 'asset.sha256']).executeTakeFirst();
  const missing = () => notFound(competitorId === null ? 'Brand logo' : 'Competitor logo');
  if (asset === undefined) throw missing();
  const etag = `"${asset.sha256}"`;
  const headers = {
    'cache-control': REVALIDATE_CACHE_CONTROL,
    'content-disposition': 'inline',
    'content-security-policy': "default-src 'none'; sandbox",
    etag,
    'x-content-type-options': 'nosniff',
  };
  if (request.ifNoneMatch === etag) return new Response(null, { status: 304, headers });
  const bytes = await ready
    .select('asset.image_data')
    .where('asset.sha256', '=', asset.sha256)
    .executeTakeFirst();
  if (bytes?.image_data == null) throw missing();
  return new Response(new Uint8Array(bytes.image_data), {
    headers: { ...headers, 'content-type': asset.content_type },
  });
}
