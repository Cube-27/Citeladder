import { sql } from 'kysely';
import { policy, type ServiceConfig } from '../config.ts';
import disposable from '../config/disposable-email-domains.json' with { type: 'json' };
import { ApiError } from '../errors.ts';

const reserved = policy.auth.mailbox.reserved_domains;
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(disposable.domains);

function domainOf(email: string): string {
  return email
    .slice(email.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/u, '');
}

export function inReservedDomain(email: string, domains: readonly string[] = reserved): boolean {
  const domain = domainOf(email);
  return domains.some((name) => domain === name || domain.endsWith(`.${name}`));
}

export function inReservedDomainSql(column: string) {
  const domain = sql`rtrim(lower(substring(${sql.ref(column)} from '@([^@]*)$')), '.')`;
  return sql<boolean>`exists (
    select from unnest(${sql.val(reserved)}::text[]) as reserved (name)
    where ${domain} = reserved.name
      or right(${domain}, length(reserved.name) + 1) = '.' || reserved.name
  )`;
}

export function inDisposableDomain(email: string): boolean {
  const labels = domainOf(email).split('.');
  return labels.some((_, index) => DISPOSABLE_DOMAINS.has(labels.slice(index).join('.')));
}

export function signupDomainRefusal(
  config: ServiceConfig,
  email: string,
): 'reserved' | 'disposable' | null {
  if (inReservedDomain(email, config.auth.signupReservedDomains)) return 'reserved';
  if (inDisposableDomain(email)) return 'disposable';
  return null;
}

export function assertSignupDomainAllowed(config: ServiceConfig, email: string): void {
  const refusal = signupDomainRefusal(config, email);
  if (refusal === 'reserved')
    throw new ApiError(422, 'This email domain cannot receive mail. Use another address.', {
      code: 'email_domain_reserved',
      details: { field: 'email' },
    });
  if (refusal === 'disposable')
    throw new ApiError(422, 'Use a permanent email address. Disposable addresses cannot sign up.', {
      code: 'disposable_email_domain',
      details: { field: 'email' },
    });
}
