/** Shared, bounded log parsing for server admission and local upload filtering. */
export type LogMapping = {
  timestamp: string;
  host: string;
  path: string;
  method: string;
  status: string;
  user_agent: string;
  client_ip: string;
  request_id: string;
  timestamp_unit: 'iso' | 'seconds' | 'milliseconds' | 'nanoseconds';
};
export type MappedLog = {
  timestamp: string;
  host: string | null;
  path: string;
  method: string;
  status: number;
  user_agent: string;
  client_ip: string | null;
  request_id: string | null;
};
export class UnsupportedLogFormat extends Error {
  readonly missing_fields: string[];
  constructor(missing_fields: string[]) {
    super('This log format does not contain the fields needed for crawler identification.');
    this.missing_fields = missing_fields;
  }
}
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function combined(line: string): Record<string, unknown> | null {
  const match =
    /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})\] "([A-Z]+) ([^"]+) HTTP\/[\d.]+" (\d{3}) (?:\d+|-) "[^"]*" "([^"]*)"\s*$/u.exec(
      line,
    );
  if (!match) return null;
  const month = months.indexOf(match[3]!);
  if (month < 0) return null;
  return {
    client_ip: match[1],
    timestamp:
      match[4] +
      '-' +
      String(month + 1).padStart(2, '0') +
      '-' +
      match[2] +
      'T' +
      match[5] +
      match[6]!.slice(0, 3) +
      ':' +
      match[6]!.slice(3),
    method: match[7],
    path: match[8],
    status: Number(match[9]),
    user_agent: match[10],
  };
}
export function parseLogLine(line: string, format: string, mapping: LogMapping): MappedLog | null {
  let value: unknown;
  if (format === 'combined') {
    value = combined(line);
    if (!value && /^\S+ \S+ \S+ \[[^\]]+\] "[^"]+" \d{3} (?:\d+|-)\s*$/u.test(line))
      throw new UnsupportedLogFormat(['user_agent']);
  } else {
    try {
      value = JSON.parse(line);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const field = (key: keyof LogMapping) => row[format === 'combined' ? key : mapping[key]];
  const missing = (['timestamp', 'path', 'user_agent'] as const).filter(
    (key) =>
      typeof field(key) !== 'string' && !(key === 'timestamp' && typeof field(key) === 'number'),
  );
  if (missing.length) throw new UnsupportedLogFormat(missing);
  let timestamp = String(field('timestamp'));
  if (format !== 'combined' && mapping.timestamp_unit !== 'iso') {
    const number = field('timestamp');
    if (typeof number !== 'number' || !Number.isFinite(number)) return null;
    const ms =
      number * { seconds: 1000, milliseconds: 1, nanoseconds: 1e-6 }[mapping.timestamp_unit];
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
    timestamp = new Date(ms).toISOString();
  }
  // Require an explicit timezone; machine-local parsing is never evidence.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp) || !Number.isFinite(Date.parse(timestamp)))
    return null;
  const status = field('status');
  const parsedStatus =
    typeof status === 'string' && /^\d{3}$/u.test(status) ? Number(status) : status;
  if (
    typeof parsedStatus !== 'number' ||
    !Number.isInteger(parsedStatus) ||
    parsedStatus < 100 ||
    parsedStatus > 599
  )
    return null;
  const text = (key: keyof LogMapping) =>
    typeof field(key) === 'string' ? String(field(key)) : null;
  const path = text('path')!;
  const method = text('method');
  if (!method || !/^[A-Z]{1,16}$/u.test(method) || !path) return null;
  return {
    timestamp,
    path,
    method,
    status: parsedStatus,
    user_agent: text('user_agent')!,
    host: text('host'),
    client_ip: text('client_ip'),
    request_id: text('request_id'),
  };
}
export function logLines(body: string, format: string, maxLines: number): string[] {
  if (!body.trim()) return [];
  let lines: string[];
  if (format === 'json_array') {
    let rows: unknown;
    try {
      rows = JSON.parse(body);
    } catch {
      throw new UnsupportedLogFormat(['json_array']);
    }
    if (!Array.isArray(rows)) throw new UnsupportedLogFormat(['json_array']);
    if (rows.length > maxLines) throw new RangeError('Too many log lines');
    lines = rows.map((row) => JSON.stringify(row));
  } else lines = body.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length > maxLines) throw new RangeError('Too many log lines');
  return lines;
}
