/** Native provider execution/pricing; frozen route identity remains shared. */
import runtime from './providers.json' with { type: 'json' };
import searchRuntime from './dataforseo.json' with { type: 'json' };
import costs from './costs.json' with { type: 'json' };
import shared from '../generated/python-config.json' with { type: 'json' };

export const providers = { ...runtime, ...shared.providers };
export const dataforseo = {
  ...searchRuntime,
  constants: { ...searchRuntime.constants, ...shared.dataforseo.constants },
  scraper: { ...searchRuntime.scraper, ...shared.dataforseo.scraper },
  microusd_per_usd: costs.microusd_per_usd,
};
