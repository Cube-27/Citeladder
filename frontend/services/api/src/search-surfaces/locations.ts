/**
 * The reviewed DataForSEO locations file: which measurement countries each
 * search surface supports, at which location code and in which languages.
 *
 * The file is written by the operator CLI (`pnpm dataforseo:locations`) and
 * reviewed in a pull request; nothing here calls DataForSEO. A country absent
 * from the file, or absent for one surface, is unsupported on that surface.
 */
import { MARKET_COUNTRIES, MARKET_LANGUAGES } from '@citeladder/contracts/markets';
import { z } from 'zod';

import reference from '../config/dataforseo-locations.json' with { type: 'json' };

export const SEARCH_SURFACES = ['google_ai_overview', 'chatgpt_search', 'gemini_consumer'] as const;
export type SearchSurface = (typeof SEARCH_SURFACES)[number];
export const isSearchSurface = (value: string): value is SearchSurface =>
  SEARCH_SURFACES.some((surface) => surface === value);

/** The DataForSEO language for a market language tag: its primary subtag. */
export const searchLanguageOf = (language: string) => language.trim().split('-')[0]!.toLowerCase();

const countries = new Set(MARKET_COUNTRIES.map(({ value }) => value));
const languages = new Set(MARKET_LANGUAGES.map(({ value }) => searchLanguageOf(value)));
const languageList = z.array(z.string().refine((code) => languages.has(code))).optional();

export const locationsFileSchema = z.object({
  source: z.string(),
  generated_at: z.string().nullable(),
  countries: z.record(
    z.string().refine((code) => countries.has(code), 'Not a market country'),
    z.object({
      location_code: z.int().positive(),
      google_ai_overview: languageList,
      chatgpt_search: languageList,
      gemini_consumer: languageList,
    }),
  ),
});
export type LocationsFile = z.infer<typeof locationsFileSchema>;

const locations = locationsFileSchema.parse(reference);
const byCode = new Map(
  Object.values(locations.countries).map((entry) => [entry.location_code, entry]),
);

/** The DataForSEO location code of a market country, or 0 when no surface supports it. */
function locationCodeOf(country: string): number {
  return locations.countries[country.trim().toUpperCase()]?.location_code ?? 0;
}

/** The search language a country is measured in, or '' when no surface offers it there. */
function searchLanguageFor(country: string, language: string): string {
  const entry = locations.countries[country.trim().toUpperCase()];
  const code = searchLanguageOf(language);
  if (!entry) return '';
  return SEARCH_SURFACES.some((surface) => entry[surface]?.includes(code)) ? code : '';
}

/** A country and language's project search context; 0 and '' where no surface supports it. */
export function searchContext(country: string, language: string) {
  return {
    serp_location_code: locationCodeOf(country),
    serp_language_code: searchLanguageFor(country, language),
  };
}

/** Whether `surface` can measure at this location code in this DataForSEO language. */
export function surfaceSupports(
  surface: SearchSurface,
  locationCode: number,
  language: string,
): boolean {
  return byCode.get(locationCode)?.[surface]?.includes(language) ?? false;
}
