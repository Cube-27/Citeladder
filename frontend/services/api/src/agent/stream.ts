/**
 * Live text for a turn in progress. A respond step arrives as JSON; while it
 * streams, the reply and the document's title and body are decoded from the
 * incomplete text so the reader sees them being written. This is display
 * only: the settlement transaction saves the validated message and revision,
 * and nothing here is persisted.
 */

export type PartialResponse = { action?: string; reply?: string; title?: string; body?: string };
export type TurnText = {
  ordinal: number;
  reply: string;
  title: string | null;
  body: string | null;
};
type TurnStep = { ordinal: number; tool: string | null; status: string };
/** Optional listeners for one execution; the worker passes none. */
export type TurnEvents = {
  step?: (event: TurnStep) => void;
  text?: (event: TurnText) => void;
};

const FIELDS: Record<string, keyof PartialResponse> = {
  action: 'action',
  reply: 'reply',
  'output.title': 'title',
  'output.body': 'body',
};
const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** A JSON string from `start` (after its quote); `complete` is false when the text ends first. */
function readString(text: string, start: number) {
  let value = '';
  let index = start;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '"') return { value, end: index + 1, complete: true };
    if (char !== '\\') {
      value += char;
      index++;
      continue;
    }
    const code = text[index + 1];
    if (code === undefined) break;
    if (code === 'u') {
      const hex = text.slice(index + 2, index + 6);
      if (hex.length < 4) break;
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }
    value += ESCAPES[code] ?? code;
    index += 2;
  }
  // A high surrogate whose pair has not arrived yet is not shown.
  return { value: value.replace(/[\uD800-\uDBFF]$/u, ''), end: text.length, complete: false };
}

/** The known string fields of a possibly incomplete step object. */
export function partialResponse(text: string): PartialResponse {
  const out: PartialResponse = {};
  const containers: ('object' | 'array')[] = [];
  const keys: string[] = [];
  let pending: string | null = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '{' || char === '[') {
      containers.push(char === '{' ? 'object' : 'array');
      keys.push(pending ?? '');
      pending = null;
      index++;
    } else if (char === '}' || char === ']') {
      containers.pop();
      keys.pop();
      index++;
    } else if (char === '"') {
      const string = readString(text, index + 1);
      if (containers.at(-1) === 'object' && pending === null) {
        if (!string.complete) break;
        pending = string.value;
      } else {
        const field = pending === null ? undefined : FIELDS[[...keys.slice(1), pending].join('.')];
        if (field) out[field] = string.value;
        pending = null;
      }
      index = string.end;
    } else if (/[\s,:]/u.test(char)) {
      index++;
    } else {
      // A number, boolean or null value.
      while (index < text.length && !/[\s,}\]]/u.test(text[index]!)) index++;
      pending = null;
    }
  }
  return out;
}

/**
 * Turns a step's growing text into throttled reply/document events. Only a
 * respond step has text worth showing; reads and methodology steps stay quiet.
 */
export function textEmitter(ordinal: number, emit: (event: TurnText) => void, every = 160) {
  let decodedAt = 0;
  let last = '';
  return (content: string) => {
    if (content.length - decodedAt < every) return;
    decodedAt = content.length;
    const partial = partialResponse(content);
    if (partial.action !== 'respond' || partial.reply === undefined) return;
    const event = {
      ordinal,
      reply: partial.reply,
      title: partial.title ?? null,
      body: partial.body ?? null,
    };
    const key = JSON.stringify(event);
    if (key === last) return;
    last = key;
    emit(event);
  };
}
