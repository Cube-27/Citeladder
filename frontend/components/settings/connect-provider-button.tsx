import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { FAMILY_META, type GrantFamily } from '@/components/settings/grant-model';
import { Plug } from '@/lib/icons';

export const CONNECT_ADMIN_ONLY = 'Ask a workspace owner or admin.';

export function ConnectProviderButton({
  family,
  label,
  onConnect,
}: Readonly<{ family: GrantFamily; label?: string; onConnect: () => void }>) {
  if (label)
    return (
      <Button variant="secondary" onClick={onConnect}>
        {label}
      </Button>
    );
  if (family === 'google') return <ActionButton action="connectGoogle" onClick={onConnect} />;
  return (
    <Button variant="secondary" onClick={onConnect}>
      <Icon icon={Plug} />
      Connect {FAMILY_META[family].title}
    </Button>
  );
}
