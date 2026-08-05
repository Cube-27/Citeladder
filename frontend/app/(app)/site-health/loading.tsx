import { ScreenSkeleton } from '@/components/site-health/screen-states';

/** Immediate App Router fallback while the Site Health route chunk initializes. */
export default function SiteHealthLoading() {
  return <ScreenSkeleton />;
}
