/**
 * Public people and parent-company facts for E-E-A-T chrome, bylines, and
 * Organization JSON-LD. Values are owner-supplied. Do not invent credentials.
 */

export type PublicPerson = {
  name: string;
  role: string;
  email: string;
  linkedin: string;
  organization: string;
};

export const PRODUCT_HEAD: PublicPerson = {
  name: 'Abhineet Jain',
  role: 'Product Head',
  email: 'abhineet.jain@cube27.com',
  linkedin: 'https://www.linkedin.com/in/abhineet-jain/',
  organization: 'Cube27',
};

export const FOUNDER: PublicPerson = {
  name: 'Arpan Jain',
  role: 'Founder & CEO',
  email: 'arpan@cube27.com',
  linkedin: 'https://www.linkedin.com/in/arpan-jain-17938b43/',
  organization: 'Cube27',
};

/** ISO date for the 3 Sep 2026 content pass. */
export const CONTENT_REVIEWED = '2026-09-03';
