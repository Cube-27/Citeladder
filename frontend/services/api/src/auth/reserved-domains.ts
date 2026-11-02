/**
 * The sign-up domain gate, and the reserved names auth mail never goes to.
 *
 * Names RFC 2606 and RFC 6761 reserve (`mailbox.reserved_domains`: `.test`,
 * `.example`, `example.com` and the rest) can never receive mail, so no real
 * person owns an address in one. Test fixtures use them, so auth mail never
 * goes to one, signup notices never report one and public sign-up refuses one.
 *
 * Public sign-up (email and Google) also refuses a disposable-mailbox domain
 * from the configured list `config/disposable-email-domains.json` (owner
 * decision of 2 November 2026). Existing accounts, sign-in and mailbox
 * requests are unaffected.
 */
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

/** Whether the address's domain is a reserved name or lies under one. */
export function inReservedDomain(email: string, domains: readonly string[] = reserved): boolean {
  const domain = domainOf(email);
  return domains.some((name) => domain === name || domain.endsWith(`.${name}`));
}

/** `inReservedDomain` in SQL, for the address column `column`. */
export function inReservedDomainSql(column: string) {
  const domain = sql`rtrim(lower(substring(${sql.ref(column)} from '@([^@]*)$')), '.')`;
  return sql<boolean>`exists (
    select from unnest(${sql.val(reserved)}::text[]) as reserved (name)
    where ${domain} = reserved.name
      or right(${domain}, length(reserved.name) + 1) = '.' || reserved.name
  )`;
}

/**
 * Whether the address's domain, or any parent of it, is on the disposable
 * list: `inbox.mailinator.com` matches the entry `mailinator.com`.
 */
export function inDisposableDomain(email: string): boolean {
  const labels = domainOf(email).split('.');
  return labels.some((_, index) => DISPOSABLE_DOMAINS.has(labels.slice(index).join('.')));
}

/** Why public sign-up refuses the address's domain, or null when it may sign up. */
export function signupDomainRefusal(
  config: ServiceConfig,
  email: string,
): 'reserved' | 'disposable' | null {
  if (inReservedDomain(email, config.auth.signupReservedDomains)) return 'reserved';
  if (inDisposableDomain(email)) return 'disposable';
  return null;
}

/** Public sign-up refuses a reserved or disposable address before it writes or mails anything. */
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
