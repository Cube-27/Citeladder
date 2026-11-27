import { BrandMark } from '@/components/ui/brand-mark';

export function Passing() {
  return (
    <h2 className="flex min-w-0 items-center">
      <BrandMark name="Google" />
      Google
      <svg viewBox="0 0 24 24" aria-hidden />
    </h2>
  );
}
