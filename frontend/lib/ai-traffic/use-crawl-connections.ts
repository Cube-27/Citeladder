import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiTrafficApi } from '@/lib/api/ai-traffic';
import { queryKeys } from '@/lib/api/query-keys';
import { CRAWL_LOG_SETUPS } from '@/lib/config/crawl-logs';
import { uploadCrawlFile } from './upload';
export type CrawlConnectionInput = Readonly<{
  projectId: string;
  workspaceId: string;
  website: string;
  canManage: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}>;
export function useCrawlConnections({
  projectId,
  workspaceId,
  website,
  canManage,
  open: controlledOpen,
  onOpenChange,
}: CrawlConnectionInput) {
  const client = useQueryClient(),
    options = { workspaceId };
  const sources = useQuery({
    queryKey: queryKeys.aiTraffic.view(workspaceId, projectId, 'sources'),
    queryFn: ({ signal }) => aiTrafficApi.sources(projectId, { workspaceId, signal }),
  });
  const [localOpen, setLocalOpen] = useState(false),
    [setup, setSetup] = useState<(typeof CRAWL_LOG_SETUPS)[number]['value']>('cloudflare_worker');
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const [origin, setOrigin] = useState(() => {
    try {
      return new URL(website).origin;
    } catch {
      return '';
    }
  });
  const [format, setFormat] = useState('ndjson'),
    [sampling, setSampling] = useState('filtered'),
    [rate, setRate] = useState('1'),
    [filter, setFilter] = useState('Best-effort recognized automated requests');
  const [point, setPoint] = useState('cdn_edge');
  const [issued, setIssued] = useState<{ id: string; token: string | null } | null>(null);
  const [sourceId, setSourceId] = useState(''),
    [resume, setResume] = useState(''),
    [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{
    uploadId: string;
    scanned: number;
    matched: number;
    ack: number;
  } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.aiTraffic.all });
  const mutation = useMutation({
    mutationFn: async (action: { kind: 'create' } | { kind: 'rotate' | 'revoke'; id: string }) => {
      if (action.kind === 'create')
        return aiTrafficApi.createSource(
          projectId,
          {
            setup,
            origin,
            format,
            collection_point: point,
            sampling:
              sampling === 'sampled'
                ? { kind: sampling, rate: Number(rate) }
                : sampling === 'filtered'
                  ? { kind: sampling, description: filter }
                  : { kind: 'none' },
          },
          options,
        );
      return aiTrafficApi.mutateSource(projectId, action.id, action.kind, options);
    },
    onSuccess: async (result) => {
      setIssued(result);
      if (setup === 'upload') setSourceId(result.id);
      await refresh();
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !sourceId) throw new Error('Choose a source and a file');
      const catalog = await aiTrafficApi.catalog(projectId, options);
      const result = await uploadCrawlFile({
        file,
        format,
        mapping: catalog.presets.custom_ndjson!,
        catalog,
        projectId,
        sourceId,
        resumeId: resume || undefined,
        options,
        onProgress: setProgress,
      });
      await refresh();
      return result;
    },
  });

  return {
    projectId,
    workspaceId,
    canManage,
    sources,
    open,
    setOpen,
    setup,
    setSetup,
    origin,
    setOrigin,
    format,
    setFormat,
    sampling,
    setSampling,
    rate,
    setRate,
    filter,
    setFilter,
    point,
    setPoint,
    issued,
    setIssued,
    sourceId,
    setSourceId,
    resume,
    setResume,
    file,
    setFile,
    progress,
    mutation,
    upload,
  };
}
