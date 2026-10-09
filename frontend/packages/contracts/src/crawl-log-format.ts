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
    /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^"]+) HTTP\/[\d.]+" (\d{3}) (?:\d+|-) "[^"]*" "([^"]*)"\s*$/u.exec(
      line,
    );
  if (!match) return null;
  // Every group takes part in a match, so the defaults never apply.
  const [, clientIp, stamp = '', method, path, status, userAgent] = match;
  const date = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/u.exec(stamp);
  if (!date) return null;
  const [, day, monthName = '', year, time, offset = ''] = date;
  const month = months.indexOf(monthName);
  if (month < 0) return null;
  return {
    client_ip: clientIp,
    timestamp: `${year}-${String(month + 1).padStart(2, '0')}-${day}T${time}${offset.slice(0, 3)}:${offset.slice(3)}`,
    method,
    path,
    status: Number(status),
    user_agent: userAgent,
  };
}
function logValue(line: string, format: string): unknown {
  if (format === 'combined') {
    const value = combined(line);
    if (!value && /^\S+ \S+ \S+ \[[^\]]+\] "[^"]+" \d{3} (?:\d+|-)\s*$/u.test(line))
      throw new UnsupportedLogFormat(['user_agent']);
    return value;
  }
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
function logTimestamp(value: unknown, unit: LogMapping['timestamp_unit']) {
  let timestamp = String(value);
  if (unit !== 'iso') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const ms = value * { seconds: 1000, milliseconds: 1, nanoseconds: 1e-6 }[unit];
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
    timestamp = new Date(ms).toISOString();
  }
  // Require an explicit timezone; machine-local parsing is never evidence.
  return /(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp) && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : null;
}
function logStatus(value: unknown) {
  const status = typeof value === 'string' && /^\d{3}$/u.test(value) ? Number(value) : value;
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}
export function parseLogLine(line: string, format: string, mapping: LogMapping): MappedLog | null {
  const value = logValue(line, format);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const field = (key: keyof LogMapping) => row[format === 'combined' ? key : mapping[key]];
  const missing = (['timestamp', 'path', 'user_agent'] as const).filter(
    (key) =>
      typeof field(key) !== 'string' && !(key === 'timestamp' && typeof field(key) === 'number'),
  );
  if (missing.length) throw new UnsupportedLogFormat(missing);
  const timestamp = logTimestamp(
    field('timestamp'),
    format === 'combined' ? 'iso' : mapping.timestamp_unit,
  );
  const status = logStatus(field('status'));
  if (timestamp === null || status === null) return null;
  const text = (key: keyof LogMapping) =>
    typeof field(key) === 'string' ? String(field(key)) : null;
  const path = text('path')!;
  const method = text('method');
  if (!method || !/^[A-Z]{1,16}$/u.test(method) || !path) return null;
  return {
    timestamp,
    path,
    method,
    status,
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
