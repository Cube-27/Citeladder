import { describe, expect, it } from 'vitest';

import {
  buildLocationsFile,
  serializeLocationsFile,
  surfaceLists,
} from '../src/search-surfaces/locations-file.ts';
import { searchContext, surfaceSupports } from '../src/search-surfaces/locations.ts';

const envelope = (result: unknown[]) => ({
  status_code: 20000,
  tasks: [{ status_code: 20000, result }],
});
const country = (code: number, iso: string) => ({
  location_code: code,
  location_name: iso,
  country_iso_code: iso,
  location_type: 'Country',
});
const lists = (locations: unknown[], languages: string[]) =>
  surfaceLists(
    envelope(locations),
    envelope(languages.map((language_code) => ({ language_name: language_code, language_code }))),
  );

describe('the DataForSEO locations file', () => {
  it('keeps market countries each surface lists, with the market languages it offers', () => {
    const file = buildLocationsFile(
      {
        google_ai_overview: lists(
          [
            country(2724, 'ES'),
            country(2392, 'JP'),
            { location_code: 1023191, country_iso_code: 'US', location_type: 'City' },
            country(2004, 'AF'),
          ],
          ['es', 'ja', 'en', 'zh-TW'],
        ),
        chatgpt_search: lists([country(2724, 'ES')], ['es', 'en']),
        gemini_consumer: lists([], ['en']),
      },
      '2026-10-10',
    );
    expect(file.countries).toEqual({
      ES: {
        location_code: 2724,
        google_ai_overview: ['en', 'es', 'ja'],
        chatgpt_search: ['en', 'es'],
      },
      JP: { location_code: 2392, google_ai_overview: ['en', 'es', 'ja'] },
    });
    expect(file.generated_at).toBe('2026-10-10');
  });

  it('refuses surfaces that disagree on a country location code', () => {
    expect(() =>
      buildLocationsFile(
        {
          google_ai_overview: lists([country(2724, 'ES')], ['es']),
          chatgpt_search: lists([country(9999, 'ES')], ['es']),
          gemini_consumer: lists([], []),
        },
        '2026-10-10',
      ),
    ).toThrow('Surfaces disagree on the location code for ES');
  });

  it('refuses a list response DataForSEO did not complete', () => {
    expect(() => surfaceLists({ status_code: 40100, tasks: [] }, envelope([]))).toThrow();
  });

  it('writes short language lists on one line', () => {
    const text = serializeLocationsFile({
      source: 'test',
      generated_at: '2026-10-10',
      countries: { ES: { location_code: 2724, chatgpt_search: ['en', 'es'] } },
    });
    expect(text).toBe(
      [
        '{',
        '  "source": "test",',
        '  "generated_at": "2026-10-10",',
        '  "countries": {',
        '    "ES": {',
        '      "location_code": 2724,',
        '      "chatgpt_search": ["en", "es"]',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });
});

describe('search contexts from the reviewed file', () => {
  it('maps a supported market to its location and search language', () => {
    expect(searchContext('de', 'de')).toEqual({
      serp_location_code: 2276,
      serp_language_code: 'de',
    });
    expect(searchContext('US', 'en-GB')).toEqual({
      serp_location_code: 2840,
      serp_language_code: 'en',
    });
    expect(surfaceSupports('chatgpt_search', 2276, 'de')).toBe(true);
  });

  it('leaves a market no surface supports unmeasurable', () => {
    expect(searchContext('JP', 'ja')).toEqual({ serp_location_code: 0, serp_language_code: '' });
    expect(surfaceSupports('google_ai_overview', 0, 'en')).toBe(false);
    expect(surfaceSupports('google_ai_overview', 2840, 'ja')).toBe(false);
  });
});
