/**
 * Names RFC 2606 and RFC 6761 reserve (`mailbox.reserved_domains`: `.test`,
 * `.example`, `example.com` and the rest) can never receive mail, so no real
 * person owns an address in one. Test fixtures use them, so auth mail never
 * goes to one, signup notices never report one and public sign-up refuses one.
 */
import { sql } from 'kysely';
import { policy, type ServiceConfig } from '../config.ts';
import { ApiError } from '../errors.ts';

const reserved = policy.auth.mailbox.reserved_domains;

/** Whether the address's domain is a reserved name or lies under one. */
export function inReservedDomain(email: string, domains: readonly string[] = reserved): boolean {
  const domain = email
    .slice(email.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/u, '');
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

/** Public sign-up refuses a reserved address before it writes or mails anything. */
export function assertSignupDomainAllowed(config: ServiceConfig, email: string): void {
  if (inReservedDomain(email, config.auth.signupReservedDomains))
    throw new ApiError(422, 'This email domain cannot receive mail. Use another address.', {
      code: 'email_domain_reserved',
      details: { field: 'email' },
    });
}
