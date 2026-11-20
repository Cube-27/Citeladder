/**
 * A pressable row's own geometry: 12 across and 8 down, its parts 12 apart,
 * at least one control tall (44 below 900px or under a coarse pointer). It
 * bleeds 12 past its list on both sides, so its text starts on the card's
 * own padding and only the hover fill reaches past it.
 */
export const pressableRowClasses =
  'focus-ring -mx-3 flex min-h-[var(--control-md)] w-[calc(100%+24px)] min-w-0 items-center gap-3 px-3 py-2 text-start';
