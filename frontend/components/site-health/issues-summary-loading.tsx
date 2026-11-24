import { ToolbarTableLoading } from '@/components/ui/table-loading';

export function IssuesPageLoading() {
  return <ToolbarTableLoading label="Loading issues" columns={6} rows={8} view />;
}
