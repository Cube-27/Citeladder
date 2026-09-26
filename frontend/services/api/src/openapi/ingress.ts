/**
 * Which upstream an ingress Caddyfile sends a request path to.
 *
 * A small model of the Caddyfile subset the two ingress files use, enough for
 * the route-ownership gate to prove every `/api/v1` operation reaches the
 * stack the manifest names:
 *
 * - blocks are `name args {` lines closed by `}`; `{$VAR:default}` and
 *   `{placeholder}` stay tokens;
 * - named matchers (`@name cond…` or `@name { cond… }`) AND their
 *   conditions. `path` and `path_regexp` are evaluated; any other condition
 *   (a header or host) is unknown, so both of its outcomes are explored;
 * - `route` keeps its handlers in written order. Any other block sorts them
 *   as Caddy's `sortRoutes` does: by directive (`handle`, `route`, `respond`,
 *   `reverse_proxy`), then, within one directive, matchers before no
 *   matcher, and the longer path first where a matcher's `path` holds exactly
 *   one pattern (other conditions beside it do not matter). A multi-pattern
 *   `path` or a regexp counts as length zero and keeps written order.
 *
 * Anything outside the subset fails loudly rather than being guessed at: a
 * directive that is neither a handler above, a matcher declaration nor a
 * known non-routing directive is refused.
 */

export type Upstreams = { python: readonly string[]; typescript: readonly string[] };

/** Where a path can end: a stack, another upstream, a fixed response, or nowhere. */
export type IngressOutcome = 'python' | 'typescript' | 'other' | 'respond' | 'unrouted';

type Node = { name: string; args: string[]; children: Node[] | null; line: number };

type Condition = { kind: 'path'; patterns: string[] } | { kind: 'regexp'; pattern: RegExp } | null;

type Matcher = { conditions: Condition[]; firstPathLength: number };

const HANDLER_ORDER = ['handle', 'route', 'respond', 'reverse_proxy'] as const;

// Directives that change headers, encoding, logging or TLS but never which
// handler serves a path.
const NON_ROUTING = new Set(['encode', 'header', 'log', 'request_body', 'request_header', 'tls']);

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|(\S+)/gu;
  for (const match of line.matchAll(pattern)) tokens.push(match[1] ?? match[2]!);
  return tokens;
}

function parse(source: string): Node[] {
  const root: Node[] = [];
  const stack: Node[][] = [root];
  source.split(/\r?\n/u).forEach((raw, index) => {
    const line = raw.replace(/(^|\s)#.*$/u, '').trim();
    if (!line) return;
    if (line === '}') {
      if (stack.length === 1) throw new Error(`Unbalanced '}' at line ${index + 1}`);
      stack.pop();
      return;
    }
    const tokens = tokenize(line);
    const opens = tokens.at(-1) === '{';
    if (opens) tokens.pop();
    const [name = '', ...args] = tokens;
    const node: Node = { name, args, children: opens ? [] : null, line: index + 1 };
    stack.at(-1)!.push(node);
    if (opens) stack.push(node.children!);
  });
  if (stack.length !== 1) throw new Error('Unclosed block in Caddyfile');
  return root;
}

function condition(name: string, args: string[], line: number): Condition {
  if (name === 'path') return { kind: 'path', patterns: args };
  if (name === 'path_regexp') {
    const source = args.length === 2 ? args[1] : args[0];
    if (!source || args.length > 2) throw new Error(`Unsupported path_regexp at line ${line}`);
    return { kind: 'regexp', pattern: new RegExp(source, 'u') };
  }
  return null;
}

function matcher(conditions: Condition[]): Matcher {
  const paths = conditions.filter((entry) => entry?.kind === 'path');
  const only =
    paths.length === 1 && paths[0]?.kind === 'path' && paths[0].patterns.length === 1
      ? paths[0].patterns[0]
      : undefined;
  return { conditions, firstPathLength: only?.length ?? 0 };
}

function collectMatchers(nodes: Node[], matchers: Map<string, Matcher>): void {
  for (const node of nodes) {
    if (node.name.startsWith('@')) {
      if (matchers.has(node.name)) throw new Error(`Duplicate matcher ${node.name}`);
      const conditions = node.children
        ? node.children.map((child) => condition(child.name, child.args, child.line))
        : [condition(node.args[0] ?? '', node.args.slice(1), node.line)];
      matchers.set(node.name, matcher(conditions));
    } else if (node.children) {
      collectMatchers(node.children, matchers);
    }
  }
}

function pathMatches(pattern: string, path: string): boolean {
  const target = path.toLowerCase();
  const glob = pattern.toLowerCase();
  const inner = glob.slice(1, -1);
  if (!glob.includes('*')) return target === glob;
  if (glob.length > 1 && glob.startsWith('*') && glob.endsWith('*') && !inner.includes('*')) {
    return target.includes(inner);
  }
  if (glob.endsWith('*') && !glob.slice(0, -1).includes('*')) {
    return target.startsWith(glob.slice(0, -1));
  }
  if (glob.startsWith('*') && !glob.slice(1).includes('*')) return target.endsWith(glob.slice(1));
  const escaped = glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'));
  return new RegExp(`^${escaped.join('[^/]*')}$`, 'u').test(target);
}

/** true, false, or null when a non-path condition leaves it undecided. */
function evaluate(entry: Matcher | undefined, path: string): boolean | null {
  if (!entry) return true;
  let undecided = false;
  for (const test of entry.conditions) {
    if (test === null) undecided = true;
    else if (test.kind === 'path') {
      if (!test.patterns.some((pattern) => pathMatches(pattern, path))) return false;
    } else if (!test.pattern.test(path)) return false;
  }
  return undecided ? null : true;
}

type Handler = { node: Node; matcher: Matcher | undefined; hasMatcher: boolean };

function handlerOf(node: Node, matchers: Map<string, Matcher>): Handler | null {
  if (node.name.startsWith('@') || NON_ROUTING.has(node.name)) return null;
  if (!(HANDLER_ORDER as readonly string[]).includes(node.name)) {
    throw new Error(`Unsupported directive '${node.name}' at line ${node.line}`);
  }
  const token = node.args[0];
  if (token?.startsWith('@')) {
    const named = matchers.get(token);
    if (!named) throw new Error(`Unknown matcher ${token} at line ${node.line}`);
    return { node, matcher: named, hasMatcher: true };
  }
  if (token?.startsWith('/')) {
    return { node, matcher: matcher([{ kind: 'path', patterns: [token] }]), hasMatcher: true };
  }
  return { node, matcher: undefined, hasMatcher: false };
}

/** Caddy's handler order for a block other than `route`. */
function sortHandlers(handlers: Handler[]): Handler[] {
  const rank = (entry: Handler) => HANDLER_ORDER.indexOf(entry.node.name as never);
  return [...handlers].sort((left, right) => {
    if (rank(left) !== rank(right)) return rank(left) - rank(right);
    if (left.hasMatcher !== right.hasMatcher) return left.hasMatcher ? -1 : 1;
    return (right.matcher?.firstPathLength ?? 0) - (left.matcher?.firstPathLength ?? 0);
  });
}

function classify(upstream: string, upstreams: Upstreams): IngressOutcome {
  if (upstreams.typescript.some((marker) => upstream.includes(marker))) return 'typescript';
  if (upstreams.python.some((marker) => upstream.includes(marker))) return 'python';
  return 'other';
}

type Walk = { matchers: Map<string, Matcher>; upstreams: Upstreams; path: string };

/** Every outcome reachable from `nodes`; `unrouted` means control falls through. */
function outcomes(nodes: Node[], ordered: boolean, walk: Walk): Set<IngressOutcome> {
  const handlers = nodes.flatMap((node) => handlerOf(node, walk.matchers) ?? []);
  const reached = new Set<IngressOutcome>();
  for (const handler of ordered ? handlers : sortHandlers(handlers)) {
    const matched = evaluate(handler.matcher, walk.path);
    if (matched === false) continue;
    const inner = terminal(handler, walk);
    for (const outcome of inner) if (outcome !== 'unrouted') reached.add(outcome);
    // A matched handler ends the block unless a `route` inside falls through.
    if (matched === true && !inner.has('unrouted')) return reached;
  }
  reached.add('unrouted');
  return reached;
}

function terminal(handler: Handler, walk: Walk): Set<IngressOutcome> {
  const { node } = handler;
  if (node.name === 'respond') return new Set(['respond']);
  if (node.name === 'reverse_proxy') {
    const upstream = node.args.find((arg, index) => index > 0 || !handler.hasMatcher);
    if (!upstream) throw new Error(`reverse_proxy without an upstream at line ${node.line}`);
    return new Set([classify(upstream, walk.upstreams)]);
  }
  if (!node.children) throw new Error(`${node.name} without a block at line ${node.line}`);
  const inner = outcomes(node.children, node.name === 'route', walk);
  // `handle` is terminal once it matches, even when nothing inside answers.
  if (node.name === 'handle' && inner.has('unrouted')) {
    inner.delete('unrouted');
    inner.add('respond');
  }
  return inner;
}

/** A parsed ingress file that answers "where can this path go?". */
export function ingressRouter(
  source: string,
  upstreams: Upstreams,
): (path: string) => Set<IngressOutcome> {
  const nodes = parse(source);
  const matchers = new Map<string, Matcher>();
  collectMatchers(nodes, matchers);
  // A site file routes inside its site blocks; a snippet routes at the top.
  // The global options block is the one with no name.
  const sites = nodes.filter(
    (node) =>
      node.children &&
      node.name &&
      !node.name.startsWith('@') &&
      !(HANDLER_ORDER as readonly string[]).includes(node.name),
  );
  const scopes = sites.length > 0 ? sites.map((site) => site.children!) : [nodes];
  return (path) => {
    const reached = new Set<IngressOutcome>();
    for (const scope of scopes) {
      for (const outcome of outcomes(scope, false, { matchers, upstreams, path })) {
        reached.add(outcome);
      }
    }
    return reached;
  };
}
