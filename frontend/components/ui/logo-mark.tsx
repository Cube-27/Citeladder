import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

/**
 * The canonical CiteLadder lockup: the mark, drawn, and the wordmark set as
 * live text.
 *
 * It used to be a 1182x205 raster with the word baked into the pixels, which
 * caused both of this component’s long-standing defects at once. The word had
 * no weight, no size and no tracking — only a scale factor — and because the
 * glyphs rode high inside the image box, every call site corrected the optical
 * centre by hand and disagreed about how: +2px in four places, +1px in one, and
 * nothing at all in the auth bar and the footer.
 *
 * The path data is the supplied square glyph re-boxed to its own ink. The source
 * viewBox padded the artwork by roughly 15% a side, so even a centred box put
 * the mark low; with the box equal to the ink, ordinary `items-center` centres
 * it for real and no call site nudges anything.
 *
 * `fill="currentColor"` is what retires the footer’s `brightness-0 invert`
 * trick: a dark band already rebinds `--color-foreground`, so one component
 * inks itself correctly on both grounds instead of one asset being filtered
 * into the other.
 */

/** The ink box of the supplied glyph: viewBox 0 0 1254 1254, ink x 193-1060 / y 209-1097. */
const MARK_VIEW_BOX = '193 209 867 888';
const MARK_ASPECT = 867 / 888;

/**
 * The raster lockup stood its mark about 1.2x the height of its wordmark. That
 * proportion is reproduced here rather than re-guessed, so the only thing that
 * changed about the lockup is the part that was asked for.
 */
const WORDMARK_RATIO = 1.2;

const MARK_PATHS = [
  'M 464 582 L 464 584 L 463 585 L 463 737 L 466 742 L 468 743 L 633 743 L 633 583 L 631 580 L 629 579 L 468 579 Z',
  'M 676 462 L 674 466 L 674 742 L 675 743 L 844 743 L 844 739 L 845 738 L 845 725 L 844 724 L 844 719 L 845 718 L 845 707 L 844 706 L 844 698 L 845 697 L 845 571 L 844 570 L 844 562 L 845 561 L 845 529 L 844 528 L 844 525 L 845 524 L 845 497 L 844 496 L 844 493 L 845 492 L 845 466 L 843 462 L 839 460 L 680 460 Z',
  'M 893 337 L 891 339 L 891 341 L 890 342 L 890 742 L 891 743 L 1055 743 L 1057 742 L 1060 738 L 1060 341 L 1057 337 L 1055 337 L 1054 336 L 896 336 L 895 337 Z',
  'M 199 216 L 199 217 L 196 220 L 194 224 L 194 227 L 193 228 L 193 867 L 196 874 L 201 880 L 206 883 L 212 884 L 213 885 L 397 885 L 398 886 L 398 1060 L 399 1061 L 399 1064 L 400 1065 L 401 1070 L 404 1076 L 406 1078 L 406 1079 L 416 1089 L 427 1095 L 430 1095 L 434 1097 L 450 1097 L 451 1096 L 458 1095 L 461 1093 L 463 1093 L 467 1091 L 476 1084 L 480 1082 L 484 1078 L 487 1077 L 489 1075 L 502 1067 L 505 1064 L 515 1058 L 518 1055 L 528 1049 L 531 1046 L 543 1039 L 550 1033 L 563 1025 L 566 1022 L 569 1021 L 572 1018 L 576 1016 L 585 1009 L 588 1008 L 598 1000 L 607 995 L 614 989 L 615 989 L 635 975 L 638 974 L 645 968 L 658 960 L 661 957 L 664 956 L 667 953 L 674 949 L 680 944 L 683 943 L 685 941 L 689 939 L 696 933 L 702 930 L 705 927 L 737 906 L 744 900 L 750 897 L 753 894 L 763 888 L 766 885 L 1047 885 L 1054 882 L 1058 878 L 1059 874 L 1060 873 L 1060 802 L 1058 798 L 1051 792 L 1048 792 L 1047 791 L 745 791 L 744 792 L 739 793 L 737 795 L 727 801 L 724 804 L 720 806 L 717 809 L 706 816 L 703 819 L 696 823 L 682 834 L 676 837 L 669 843 L 668 843 L 655 853 L 648 857 L 641 863 L 618 878 L 615 881 L 611 883 L 601 891 L 594 895 L 591 898 L 581 904 L 578 907 L 571 911 L 558 921 L 538 934 L 535 937 L 531 939 L 521 947 L 518 948 L 508 956 L 507 956 L 499 962 L 496 963 L 494 965 L 493 964 L 493 802 L 492 801 L 492 799 L 488 794 L 487 794 L 485 792 L 482 792 L 481 791 L 297 791 L 296 790 L 296 306 L 297 305 L 679 305 L 683 303 L 688 298 L 690 294 L 690 220 L 688 216 L 683 211 L 681 210 L 678 210 L 677 209 L 213 209 L 212 210 L 206 211 Z',
];

/**
 * `size` is the mark’s height in pixels, which is what it meant when this was
 * an image, so every call site keeps its number and simply gains the two pixels
 * it was asked for. The wordmark is derived from it rather than passed
 * separately: a lockup whose two halves can be scaled independently is a lockup
 * that drifts.
 *
 * `wordmark={false}` is for chrome too small to set the word legibly — the
 * illustrative product window runs the mark alone.
 */
export function LogoMark({
  size = 24,
  wordmark = true,
  className,
}: Readonly<{ size?: number; wordmark?: boolean; className?: string }>) {
  const fontSize = Math.round(size / WORDMARK_RATIO);
  return (
    <span
      className={cn('text-foreground inline-flex shrink-0 items-center', className)}
      style={{ gap: Math.round(size * 0.3), lineHeight: 1 }}
      aria-hidden="true"
    >
      <svg
        viewBox={MARK_VIEW_BOX}
        width={Math.round(size * MARK_ASPECT)}
        height={size}
        fill="currentColor"
        focusable="false"
        className="block shrink-0"
      >
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {/* An arbitrary `text-[..]` utility is rejected by check:policy and the
          size is a prop rather than a ladder rung, so it travels as a style.
          The wordmark itself is one brand face at one weight on every surface
          (`.logo-wordmark`, globals.css): it cannot ride the scoped
          `--font-display` variable, because the public scope rebinds that to
          Instrument Serif, a serif face — the wordmark stays one sans face
          everywhere. */}
      {wordmark ? (
        <span
          className="logo-wordmark whitespace-nowrap"
          style={{ fontSize, letterSpacing: '-0.02em' } as CSSProperties}
        >
          CiteLadder
        </span>
      ) : null}
    </span>
  );
}
