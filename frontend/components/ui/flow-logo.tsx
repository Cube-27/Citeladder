import { LogoMark } from '@/components/ui/logo-mark';
import { websiteHref } from '@/lib/config/app-link';

export function FlowLogo() {
  return (
    <a
      href={websiteHref('/')}
      aria-label="CiteLadder home"
      className="focus-ring text-ink rounded-control -ms-1 inline-flex p-1"
    >
      <LogoMark size={22} />
    </a>
  );
}
