/** Credentialed JSON boundary: no redirects, public pinned DNS for customer destinations. */
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { FetchError, validateAddress } from '../projects/safe-fetch.ts';
import { providerPolicy } from './config.ts';

export class ProbeError extends Error {
  readonly code: string;
  constructor(code: string) { super(`Connection test failed: ${code}`); this.code = code; }
}
export type ProbeRequest = { url: string; headers: Record<string, string>; body?: unknown;
  timeoutSeconds: number; maxBytes: number; customerDestination: boolean };
export type ProbeTransport = (input: ProbeRequest) => Promise<{ status: number; body: unknown }>;
export const sendProbe: ProbeTransport = async (input) => {
  const url = new URL(input.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !input.customerDestination)) || url.username || url.password)
    throw new ProbeError('invalid_url');
  const signal = AbortSignal.timeout(input.timeoutSeconds * 1000);
  const host = url.hostname.replaceAll(/[[\]]/gu, '');
  const addresses = await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const aborted = () => reject(new ProbeError('timeout'));
    signal.addEventListener('abort', aborted, { once: true });
    const result = isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : lookup(host, { all: true });
    result.then(resolve, () => reject(new ProbeError('dns_resolution_failed')))
      .finally(() => signal.removeEventListener('abort', aborted));
  });
  if (!addresses.length) throw new ProbeError('dns_resolution_failed');
  if (input.customerDestination) {
    if (!providerPolicy.app.allowed_ports.includes(Number(url.port || 443)))
      throw new ProbeError('invalid_url');
    try { for (const item of addresses) validateAddress(item.address); }
    catch (error) { if (error instanceof FetchError) throw new ProbeError(error.code); throw error; }
  }
  const target = addresses[0]!;
  const body = input.body === undefined ? undefined : Buffer.from(JSON.stringify(input.body));
  if (body && body.length > providerPolicy.app.max_request_bytes) throw new ProbeError('request_too_large');
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, { method: body ? 'POST' : 'GET', agent: false, signal,
      headers: { ...input.headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      lookup: (_host, _options, callback) => callback(null, target.address, target.family),
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('error', (error) => reject(error instanceof ProbeError ? error : new ProbeError('connection')));
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > input.maxBytes) res.destroy(new ProbeError('response_too_large'));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        let parsed: unknown;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { reject(new ProbeError('parse_error')); return; }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', () => reject(new ProbeError(signal.aborted ? 'timeout' : 'connection')));
    req.end(body);
  });
};
