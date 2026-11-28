import { z } from 'zod';

import { humanizeApiError } from '@/lib/api/errors';

export type ReviewCompetitor = {
  id: string;
  name: string;
  aliases: string[];
  domains: string[];
  selected: boolean;
};

export function toggleCompetitor(
  items: ReviewCompetitor[],
  { index, maximum }: Readonly<{ index: number; maximum: number | undefined }>,
): ReviewCompetitor[] {
  const selected = items.filter((item) => item.selected).length;
  return items.map((item, itemIndex) =>
    itemIndex !== index || (!item.selected && (maximum === undefined || selected >= maximum))
      ? item
      : { ...item, selected: !item.selected },
  );
}

export function editCompetitor(
  items: ReviewCompetitor[],
  { index, name, domain }: Readonly<{ index: number; name: string; domain: string }>,
): ReviewCompetitor[] {
  return items.map((item, itemIndex) =>
    itemIndex === index
      ? { ...item, domains: [domain, ...item.domains.slice(1).filter((d) => d !== domain)], name }
      : item,
  );
}

export function addCompetitor(
  items: ReviewCompetitor[],
  maximum: number | undefined,
): ReviewCompetitor[] {
  if (maximum === undefined || items.filter((item) => item.selected).length >= maximum)
    return items;
  return [
    ...items,
    {
      id: `competitor:manual:${globalThis.crypto.randomUUID()}`,
      name: '',
      aliases: [],
      domains: [],
      selected: true,
    },
  ];
}

export type ReviewDomain = {
  id: string;
  domain: string;
  selected: boolean;
};

export const brandStepSchema = z.object({
  brand_name: z.string().trim().min(1, 'Enter your brand name').max(255, 'Brand name is too long'),
  website_url: z
    .string()
    .trim()
    .min(1, 'Enter your website')
    .max(1024, 'Website is too long')
    .refine((value) => {
      try {
        const url = new URL(value.includes('://') ? value : `https://${value}`);
        return (
          (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
        );
      } catch {
        return false;
      }
    }, 'Enter a valid website'),
  primary_market: z
    .string()
    .trim()
    .refine((value) => value === 'GLOBAL' || value.length === 2, 'Pick a primary market'),
  language_code: z.string().trim().min(2, 'Pick a language'),
  industry: z.string().trim().min(1, 'Pick an industry').max(255, 'Industry is too long'),
  subindustry: z.string().trim().max(255, 'Subindustry is too long'),
});

export type BrandStepValues = z.infer<typeof brandStepSchema>;

export const emptyBrandStep: BrandStepValues = {
  brand_name: '',
  website_url: '',
  primary_market: 'US',
  language_code: 'en',
  industry: 'General',
  subindustry: '',
};

export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

export function onboardingErrorMessage(error: unknown): string {
  const { status, code } = humanizeApiError(error);
  if (status === 403) {
    return 'Your workspace has reached its project limit. Free a slot or update your plan, then try again.';
  }
  if (status === 422) {
    return 'Check the website and required details, then try again.';
  }
  if (code === 'request_timeout') {
    return 'This is taking longer than usual. We’re still working on it and checking again…';
  }
  return 'We couldn’t finish this setup step just now. Try again.';
}
