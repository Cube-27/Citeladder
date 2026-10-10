/**
 * Google Cloud access for pull sources. CiteLadder reads customer
 * subscriptions as one dedicated reader service account, which the runtime
 * service account impersonates; no key file exists.
 */
import { policy, resolveSettingSpec } from '../config.ts';

/** The reader service account; empty means the connector is unavailable here. */
export function crawlLogReaderEmail(env: Record<string, string | undefined> = process.env) {
  return String(resolveSettingSpec(policy.settings.crawl_log_reader_email, env)).trim();
}
