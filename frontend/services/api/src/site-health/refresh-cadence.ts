import type { SiteWorkerSettings } from './runtime.ts';

/**
 * Work a crawl repeats as its tasks settle (the live score summary, discovery
 * progress) reloads crawl-wide state under the crawl lock every task commit
 * also takes, so it runs after a growing batch or an elapsed-time bound. The
 * mark is display cadence, not a fact: terminalization rebuilds from persisted
 * evidence regardless, so a lost mark only refreshes more often.
 */
export class RefreshCadence {
  readonly #marks = new Map<string, { refreshedAt: number; observed: number; pending: number }>();
  readonly #settings: SiteWorkerSettings['scoreRefresh'];
  constructor(settings: SiteWorkerSettings['scoreRefresh']) {
    this.#settings = settings;
  }
  admits(crawlId: string, now = performance.now()) {
    const { pageInterval, minIntervalSeconds, pageFraction } = this.#settings;
    if (pageInterval <= 0 && minIntervalSeconds <= 0) return true;
    const mark = this.#marks.get(crawlId);
    if (!mark) {
      // A crawl's first settlement always refreshes, so its first progress is prompt.
      this.#marks.set(crawlId, { refreshedAt: now, observed: 1, pending: 0 });
      this.#prune();
      return true;
    }
    mark.observed++;
    mark.pending++;
    const growing = Math.max(
      pageInterval,
      Math.ceil((mark.observed - mark.pending) * pageFraction),
    );
    const due =
      (pageInterval > 0 && mark.pending >= growing) ||
      (minIntervalSeconds > 0 && now - mark.refreshedAt >= minIntervalSeconds * 1000);
    if (due) {
      mark.refreshedAt = now;
      mark.pending = 0;
    }
    this.#prune();
    return due;
  }
  /** Bound the table: a forgotten crawl simply refreshes once more than it owed. */
  #prune() {
    const cap = this.#settings.maxTrackedCrawls;
    if (cap <= 0 || this.#marks.size <= cap) return;
    const stale = [...this.#marks].sort((a, b) => a[1].refreshedAt - b[1].refreshedAt);
    for (const [id] of stale.slice(0, this.#marks.size - cap)) this.#marks.delete(id);
  }
}

/** One cadence per kind of repeated work, so a discover burst never delays a score refresh. */
export function crawlCadences(settings: SiteWorkerSettings['scoreRefresh']) {
  return { score: new RefreshCadence(settings), discovery: new RefreshCadence(settings) };
}
export type CrawlCadences = ReturnType<typeof crawlCadences>;
