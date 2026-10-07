import { MarketingNav } from '@/components/marketing/chrome/nav';
import { NavigationPath } from '@/components/marketing/chrome/nav-items';

/** Hydrates the marketing navigation for its dropdown and mobile controls. */
export function MarketingNavIsland({ path }: Readonly<{ path: string }>) {
  return (
    <NavigationPath value={path}>
      <MarketingNav />
    </NavigationPath>
  );
}
