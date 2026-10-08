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
      const point = Number.parseInt(hex, 16);
      // An invalid escape shows nothing; the validated reply replaces this text anyway.
      if (!Number.isNaN(point)) value += String.fromCodePoint(point);
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
  const state: ParseState = { out: {}, containers: [], keys: [], pending: null };
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '"') {
      const string = readString(text, index + 1);
      if (!takeString(state, string)) break;
      index = string.end;
    } else if (char === '{' || char === '[') {
      state.containers.push(char === '{' ? 'object' : 'array');
      state.keys.push(state.pending ?? '');
      state.pending = null;
      index++;
    } else if (char === '}' || char === ']') {
      state.containers.pop();
      state.keys.pop();
      index++;
    } else if (/[\s,:]/u.test(char)) {
      index++;
    } else {
      index = scalarEnd(text, index);
      state.pending = null;
    }
  }
  return state.out;
}

type ParseState = {
  out: PartialResponse;
  containers: ('object' | 'array')[];
  keys: string[];
  /** The key awaiting its value, inside an object. */
  pending: string | null;
};

/** Records a key or a known field's value; false stops at a key that has not finished arriving. */
function takeString(state: ParseState, string: { value: string; complete: boolean }) {
  if (state.containers.at(-1) === 'object' && state.pending === null) {
    if (!string.complete) return false;
    state.pending = string.value;
    return true;
  }
  if (state.pending !== null) {
    const field = FIELDS[[...state.keys.slice(1), state.pending].join('.')];
    if (field) state.out[field] = string.value;
  }
  state.pending = null;
  return true;
}

/** The end of a number, boolean or null value. */
function scalarEnd(text: string, start: number) {
  let index = start;
  while (index < text.length && !/[\s,}\]]/u.test(text[index]!)) index++;
  return index;
}

/**
 * Turns a step's growing text into throttled reply/document events. Only a
 * respond step has text worth showing; reads and methodology steps stay quiet.
 */
export function textEmitter(ordinal: number, emit: (event: TurnText) => void, every = 160) {
  let decodedAt = 0;
  let last = '';
  return (content: string) => {
    // Each event re-decodes and resends the text so far, so a long document
    // is sampled less often: about every 5% once it passes a few thousand characters.
    if (content.length - decodedAt < Math.max(every, content.length / 20)) return;
    decodedAt = content.length;
    const partial = partialResponse(content);
    if (partial.action !== 'respond' || partial.reply === undefined) return;
    const event = {
      ordinal,
      reply: partial.reply,
      title: partial.title ?? null,
      body: partial.body ?? null,
    };
    // Fields only grow while a step streams, so their lengths show any change.
    const key = `${event.reply.length}:${event.title?.length ?? -1}:${event.body?.length ?? -1}`;
    if (key === last) return;
    last = key;
    emit(event);
  };
}
