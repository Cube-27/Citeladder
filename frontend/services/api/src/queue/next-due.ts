/** Statuses whose lease each lane's recovery reclaims once `lease_expires_at` passes. */
export const leasedStatuses = ['leased', 'running'] as const;

type DueRow = { due: Date | string | null; expires: Date | string | null } | undefined;

/**
 * The earlier of a lane's next claimable row and its next lease expiry. An
 * expired lease is pending work: a killed request or execution leaves it for
 * recovery, so an idle runner must stay (or start a successor) for it too.
 */
export function earliestDue(row: DueRow): Date | null {
  const times = [row?.due, row?.expires]
    .filter((value) => value !== null && value !== undefined)
    .map((value) => new Date(value).getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
