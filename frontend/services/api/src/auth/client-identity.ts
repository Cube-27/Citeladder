import ipaddr from 'ipaddr.js';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { ServiceConfig } from '../config.ts';
import { clientNetworkPrefixes, type ClientNetworkScope } from '../config/abuse.ts';
import type { AppEnv } from '../context.ts';

export type TrustedProxies = readonly [ipaddr.IPv4 | ipaddr.IPv6, number][];

/** Parsed once at config load, so a malformed CIDR fails startup, not every login. */
export function parseTrustedProxies(cidrs: string): TrustedProxies {
  return cidrs
    .split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean)
    .map((cidr) => ipaddr.parseCIDR(cidr));
}

/** Forwarding headers are authority only when the socket peer is trusted. */
export function clientIdentity(
  peer: string,
  forwarded: string | undefined,
  networks: TrustedProxies,
): string {
  if (!ipaddr.isValid(peer)) return peer;
  const trusted = (value: string) => {
    const address = ipaddr.process(value);
    return networks.some(
      ([network, prefix]) => address.kind() === network.kind() && address.match(network, prefix),
    );
  };
  if (!trusted(peer) || !forwarded) return peer;
  for (const value of forwarded.split(',').reverse()) {
    if (!ipaddr.isValid(value.trim())) return peer;
    if (!trusted(value.trim())) return ipaddr.process(value.trim()).toString();
  }
  return peer;
}

/**
 * The network a per-visitor budget counts: an IPv4 address as it is, an IPv6
 * address widened to the scope's prefix, so rotating addresses inside one
 * allocation never earns a fresh budget. A value that is not an address
 * (`unavailable`) stays one shared subject.
 */
export function clientNetwork(identity: string, scope: ClientNetworkScope): string {
  if (!ipaddr.isValid(identity)) return identity;
  const address = ipaddr.process(identity);
  if (address.kind() === 'ipv4') return address.toString();
  const prefix = clientNetworkPrefixes[scope];
  return `${ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/${prefix}`).toString()}/${prefix}`;
}

/** The trusted visitor's network: the subject of every per-visitor (`client`) budget. */
export function trustedClientNetwork(
  c: Context<AppEnv>,
  config: ServiceConfig,
  scope: ClientNetworkScope = 'client',
): string {
  return clientNetwork(trustedClientIdentity(c, config), scope);
}

/**
 * The trusted visitor's exact address, for what must name one host (Turnstile's
 * `remoteip`). Budgets count `trustedClientNetwork` instead.
 */
export function trustedClientIdentity(c: Context<AppEnv>, config: ServiceConfig): string {
  // Behind Cloud Run the socket peer is Google's front end; the admitted Worker names the visitor.
  const admitted = c.get('clientIp');
  if (admitted) return admitted;
  // app.request fixtures have no socket; headers still cannot manufacture a peer.
  const socket = (c.env as { incoming?: unknown } | undefined)?.incoming;
  const peer = socket ? (getConnInfo(c).remote.address ?? 'unavailable') : 'unavailable';
  return clientIdentity(peer, c.req.header('x-forwarded-for'), config.auth.trustedProxies);
}
