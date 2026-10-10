/**
 * Builds the reviewed DataForSEO locations file from DataForSEO's own
 * location and language lists, one pair per search surface. Pure: the
 * operator CLI fetches the lists and writes the result for review.
 */
import { MARKET_COUNTRIES, MARKET_LANGUAGES } from '@citeladder/contracts/markets';
import { z } from 'zod';

import {
  locationsFileSchema,
  SEARCH_SURFACES,
  searchLanguageOf,
  type LocationsFile,
  type SearchSurface,
} from './locations.ts';

const locationRow = z.looseObject({
  location_code: z.int(),
  country_iso_code: z.string().nullish(),
  location_type: z.string().nullish(),
});
const languageRow = z.looseObject({ language_code: z.string() });
/** DataForSEO's envelope: one task whose result is the list. */
const listEnvelope = <Row extends z.ZodType>(row: Row) =>
  z.looseObject({
    status_code: z.literal(20000),
    tasks: z
      .array(z.looseObject({ status_code: z.literal(20000), result: z.array(row).nullable() }))
      .min(1),
  });
const locationsEnvelope = listEnvelope(locationRow);
const languagesEnvelope = listEnvelope(languageRow);

export type SurfaceLists = {
  locations: z.infer<typeof locationRow>[];
  languages: z.infer<typeof languageRow>[];
};

/** One surface's lists from DataForSEO's two response bodies; anything else throws. */
export function surfaceLists(locations: unknown, languages: unknown): SurfaceLists {
  return {
    locations: locationsEnvelope.parse(locations).tasks.flatMap((task) => task.result ?? []),
    languages: languagesEnvelope.parse(languages).tasks.flatMap((task) => task.result ?? []),
  };
}

const candidateLanguages = [
  ...new Set(MARKET_LANGUAGES.map(({ value }) => searchLanguageOf(value))),
].sort();

function countryCode(lists: SurfaceLists, country: string): number | null {
  const row = lists.locations.find(
    (location) =>
      location.location_type === 'Country' && location.country_iso_code?.toUpperCase() === country,
  );
  return row?.location_code ?? null;
}

/**
 * Every market country at least one surface supports: its location code and,
 * per surface, the market languages that surface lists. A country whose
 * surfaces disagree on its location code is refused for review.
 */
export function buildLocationsFile(
  lists: Record<SearchSurface, SurfaceLists>,
  generatedAt: string,
): LocationsFile {
  const countries: LocationsFile['countries'] = {};
  for (const { value: country } of [...MARKET_COUNTRIES].sort((a, b) =>
    a.value.localeCompare(b.value),
  )) {
    const entry: LocationsFile['countries'][string] = { location_code: 0 };
    for (const surface of SEARCH_SURFACES) {
      const code = countryCode(lists[surface], country);
      if (code === null) continue;
      if (entry.location_code && entry.location_code !== code)
        throw new Error(`Surfaces disagree on the location code for ${country}`);
      const offered = new Set(
        lists[surface].languages.map((row) => row.language_code.toLowerCase()),
      );
      const languages = candidateLanguages.filter((language) => offered.has(language));
      if (!languages.length) continue;
      entry.location_code = code;
      entry[surface] = languages;
    }
    if (entry.location_code) countries[country] = entry;
  }
  return locationsFileSchema.parse({
    source: 'DataForSEO locations and languages lists, fetched by `pnpm dataforseo:locations`.',
    generated_at: generatedAt,
    countries,
  });
}

/** Two-space JSON with short string lists on one line, as the formatter keeps them. */
export function serializeLocationsFile(file: LocationsFile): string {
  return `${JSON.stringify(file, null, 2).replace(
    /\[\n\s+("[^"\n]*"(?:,\n\s+"[^"\n]*")*)\n\s+\]/gu,
    (_, items: string) => `[${items.split(/,\n\s+/u).join(', ')}]`,
  )}\n`;
}
