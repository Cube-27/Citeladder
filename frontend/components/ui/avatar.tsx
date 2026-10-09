import { textRole } from '@/components/ui/typography';
import { cn, emailInitials } from '@/lib/utils';

/**
 * Avatar — a person's initials on a neutral disc.
 *
 * The account menu, Settings' identity row and the member roster each drew
 * their own disc at their own size and type role. One recipe now: the well
 * fill with secondary ink (never accent — an avatar identifies, it does not
 * act), uppercase initials at the size's role, a full circle.
 *
 *   - `sm` (28px) — beside a name in a row or a menu trigger.
 *   - `md` (40px) — the identity row of a profile.
 *
 * Beside visible text that already names the person (the usual case) the
 * disc is `decorative` and hidden from assistive tech, so the name is not read
 * twice. Standing alone, it is an image named by `name`.
 */
const SIZE = {
  sm: textRole('caption', 'size-7'),
  md: textRole('itemTitle', 'size-10'),
} as const;

export type AvatarSize = keyof typeof SIZE;

export function Avatar({
  name,
  initials,
  size = 'sm',
  decorative = false,
  className,
}: Readonly<{
  /** The person's name or email; the accessible name when not decorative. */
  name: string;
  /** Override the initials derived from `name` (an email's local part). */
  initials?: string;
  size?: AvatarSize;
  /** True when adjacent text already names the person. */
  decorative?: boolean;
  className?: string;
}>) {
  const label = decorative ? {} : { role: 'img', 'aria-label': name };
  return (
    <span
      {...label}
      aria-hidden={decorative || undefined}
      className={cn(
        'bg-well text-secondary flex shrink-0 items-center justify-center rounded-full uppercase',
        SIZE[size],
        className,
      )}
    >
      {initials ?? emailInitials(name)}
    </span>
  );
}
