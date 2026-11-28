import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';

export function PromptApproval({
  enabled,
  disabled,
  onDecide,
}: Readonly<{ enabled: boolean; disabled: boolean; onDecide?: (approved: boolean) => void }>) {
  if (!onDecide) return <Tag>{enabled ? 'Approved' : 'Not approved'}</Tag>;
  return (
    <Button variant="secondary" disabled={disabled} onClick={() => onDecide(!enabled)}>
      {enabled ? 'Disable' : 'Approve'}
    </Button>
  );
}
