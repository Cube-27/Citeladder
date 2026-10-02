import ipaddr from 'ipaddr.js';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { ServiceConfig } from '../config.ts';
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

export function trustedClientIdentity(c: Context<AppEnv>, config: ServiceConfig): string {
  // Behind Cloud Run the socket peer is Google's front end; the admitted Worker names the visitor.
  const admitted = c.get('clientIp');
  if (admitted) return admitted;
  // app.request fixtures have no socket; headers still cannot manufacture a peer.
  const peer = c.env?.incoming ? (getConnInfo(c).remote.address ?? 'unavailable') : 'unavailable';
  return clientIdentity(peer, c.req.header('x-forwarded-for'), config.auth.trustedProxies);
}
