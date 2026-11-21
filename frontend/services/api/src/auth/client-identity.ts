import ipaddr from 'ipaddr.js';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { ServiceConfig } from '../config.ts';
import { clientNetworkPrefixes, type ClientNetworkScope } from '../config/abuse.ts';
import type { AppEnv } from '../context.ts';

export type TrustedProxies = readonly [ipaddr.IPv4 | ipaddr.IPv6, number][];

export function parseTrustedProxies(cidrs: string): TrustedProxies {
  return cidrs
    .split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean)
    .map((cidr) => ipaddr.parseCIDR(cidr));
}

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

export function clientNetwork(identity: string, scope: ClientNetworkScope): string {
  if (!ipaddr.isValid(identity)) return identity;
  const address = ipaddr.process(identity);
  if (address.kind() === 'ipv4') return address.toString();
  const prefix = clientNetworkPrefixes[scope];
  const network = ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/${prefix}`);
  return `${network.toString()}/${prefix}`;
}

export function trustedClientNetwork(
  c: Context<AppEnv>,
  config: ServiceConfig,
  scope: ClientNetworkScope = 'client',
): string {
  return clientNetwork(trustedClientIdentity(c, config), scope);
}

export function trustedClientIdentity(c: Context<AppEnv>, config: ServiceConfig): string {
  const admitted = c.get('clientIp');
  if (admitted) return admitted;
  const socket = (c.env as { incoming?: unknown } | undefined)?.incoming;
  const peer = socket ? (getConnInfo(c).remote.address ?? 'unavailable') : 'unavailable';
  return clientIdentity(peer, c.req.header('x-forwarded-for'), config.auth.trustedProxies);
}
