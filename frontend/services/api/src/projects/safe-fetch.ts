/** Public website transport. Each hop validates all DNS answers and dials one pinned IP. */
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

import ipaddr from 'ipaddr.js';
import { getDomain } from 'tldts';

import { policy } from '../config.ts';

export class FetchError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export type FetchOptions = {
  maxBytes: number;
  timeoutSeconds: number;
  redirects: number;
  contentTypes: readonly string[];
  domain?: string;
  signal?: AbortSignal;
  maxDecodedBytes?: number;
  gate?: <T>(url: URL, send: () => Promise<T>, signal: AbortSignal) => Promise<T>;
  authorize?: (url: URL) => Promise<void>;
};
export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  charset?: string;
  headers?: Record<string, string>;
  redirects?: string[];
};
type TransportResult = {
  status: number;
  location: string | undefined;
  type: string;
  body: Buffer;
  charset?: string;
  headers?: Record<string, string>;
};
export type WebsiteFetcher = (url: string, options: FetchOptions) => Promise<FetchedPage>;
type Dns = (host: string) => Promise<readonly { address: string; family: number }[]>;

export function publicUrl(value: string, base?: string): URL {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new FetchError('invalid_url');
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (
    !policy.web_fetch.schemes.includes(url.protocol.slice(0, -1)) ||
    !policy.web_fetch.ports.includes(port) ||
    url.username ||
    url.password ||
    !url.hostname ||
    url.href.length > 1024
  )
    throw new FetchError('invalid_url');
  url.hash = '';
  return url;
}
export function websiteIdentity(value: string) {
  const url = publicUrl(value.includes('://') ? value.trim() : `https://${value.trim()}`);
  const domain = getDomain(url.hostname);
  if (!domain || isIP(url.hostname.replaceAll(/[[\]]/gu, ''))) throw new FetchError('invalid_url');
  return { url: url.href, domain };
}

// IANA special-purpose IPv4 blocks that ipaddr labels ordinary unicast.
// These fixed CIDRs deny outbound targets; they are not server addresses to connect to.
const SPECIAL_PURPOSE_IPV4 = [
  '192.0.0.0/24', // NOSONAR: a denied SSRF target, not a connection address.
  '192.0.2.0/24',
  '198.51.100.0/24',
  '203.0.113.0/24',
];

export function validateAddress(address: string): void {
  if (!ipaddr.isValid(address)) throw new FetchError('ssrf_blocked');
  const ip = ipaddr.process(address);
  if (ip.range() !== 'unicast') throw new FetchError('ssrf_blocked');
  if (
    ip.kind() === 'ipv4' &&
    SPECIAL_PURPOSE_IPV4.some((range) => ip.match(ipaddr.parseCIDR(range) as [ipaddr.IPv4, number]))
  )
    throw new FetchError('ssrf_blocked');
}

export function decodedBody(body: Buffer, encoding: string, maxBytes: number): Buffer {
  let decoded: Buffer;
  try {
    const options = { maxOutputLength: maxBytes };
    switch (encoding.trim().toLowerCase()) {
      case '':
      case 'identity':
        decoded = body;
        break;
      case 'gzip':
        decoded = gunzipSync(body, options);
        break;
      case 'deflate':
        decoded = inflateSync(body, options);
        break;
      case 'br':
        decoded = brotliDecompressSync(body, options);
        break;
      default:
        throw new FetchError('content_encoding');
    }
  } catch (error) {
    if (error instanceof FetchError) throw error;
    throw new FetchError('response_too_large');
  }
  if (decoded.length > maxBytes) throw new FetchError('response_too_large');
  return decoded;
}

export async function pinnedRequest(
  url: URL,
  target: { address: string; family: number },
  options: FetchOptions,
  signal: AbortSignal,
) {
  return new Promise<TransportResult>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        agent: false,
        // Exactly one validated address is selected above; no family race.
        family: target.family,
        signal,
        headers: {
          'user-agent': policy.web_fetch.user_agent,
          accept: options.contentTypes.join(', '),
          'accept-encoding': 'gzip, deflate, br',
        },
        // Keep the URL hostname for Host, TLS SNI and certificate verification.
        lookup: (_host, _options, callback) => callback(null, target.address, target.family),
      },
      (response) => {
        response.on('error', reject);
        const status = response.statusCode ?? 0;
        const type = String(response.headers['content-type'] ?? '')
          .split(';')[0]!
          .trim()
          .toLowerCase();
        if (status >= 300 && status < 400 && response.headers.location) {
          response.destroy();
          resolve({ status, location: response.headers.location, type, body: Buffer.alloc(0) });
          return;
        }
        if (status >= 200 && status < 300 && !options.contentTypes.includes(type)) {
          response.destroy(new FetchError('content_type'));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > options.maxBytes) {
            response.destroy(new FetchError('response_too_large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            resolve({
              status,
              location: undefined,
              type,
              body: decodedBody(
                Buffer.concat(chunks),
                String(response.headers['content-encoding'] ?? ''),
                options.maxDecodedBytes ?? options.maxBytes,
              ),
              charset:
                /charset\s*=\s*["']?([^;"'\s]+)/iu.exec(
                  String(response.headers['content-type'] ?? ''),
                )?.[1] ?? '',
              headers: Object.fromEntries(
                [
                  'content-type',
                  'content-length',
                  'content-encoding',
                  'x-robots-tag',
                  'link',
                  'last-modified',
                  'strict-transport-security',
                ].flatMap((key) =>
                  typeof response.headers[key] === 'string' ? [[key, response.headers[key]]] : [],
                ),
              ),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

export function createWebsiteFetcher(
  dns: Dns = (host) => lookup(host, { all: true }),
  send = pinnedRequest,
): WebsiteFetcher {
  return async (value, options) => {
    const timeout = options.gate
      ? new AbortController().signal
      : AbortSignal.timeout(options.timeoutSeconds * 1000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    let url = publicUrl(value);
    const redirects: string[] = [];
    for (let hop = 0; hop <= options.redirects; hop++) {
      signal.throwIfAborted();
      if (options.domain && getDomain(url.hostname) !== options.domain)
        throw new FetchError('out_of_scope');
      const sendHop = async () => {
        const hopSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(options.timeoutSeconds * 1000),
        ]);
        await options.authorize?.(url);
        hopSignal.throwIfAborted();
        const host = url.hostname.replaceAll(/[[\]]/gu, '');
        const addresses = isIP(host)
          ? [{ address: host, family: isIP(host) }]
          : await abortable(dns(host), hopSignal);
        if (!addresses.length) throw new FetchError('dns_resolution_failed');
        for (const target of addresses) validateAddress(target.address);
        return send(url, addresses[0]!, options, hopSignal);
      };
      const result = options.gate ? await options.gate(url, sendHop, signal) : await sendHop();
      if (!result.location)
        return {
          url: url.href,
          status: result.status,
          contentType: result.type,
          body: result.body,
          charset: result.charset,
          headers: result.headers,
          redirects,
        };
      url = publicUrl(result.location, url.href);
      redirects.push(url.href);
    }
    throw new FetchError('redirect_limit');
  };
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
export const fetchWebsite = createWebsiteFetcher();
