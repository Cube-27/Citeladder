import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { mcpPolicy } from './config.ts';
import type { ConsentWorkspace } from './oauth.ts';

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/**
 * The consent CSP loads nothing but inline style, so the design system's token
 * sheet and self-hosted faces cannot reach this page. These values mirror the
 * light tokens in `apps/app/src/globals.css` (named beside each) on the system
 * font stack; keep them in step when those tokens change.
 */
const STYLE = `
:root{color-scheme:light;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:20px;
--paper:rgb(255 255 255);/* panel */--ground:rgb(244 245 244);/* background */--well:rgb(239 241 240);/* well */
--ink:rgb(47 52 49);/* foreground */--ink-2:rgb(78 85 81);/* secondary */--ink-3:rgb(97 105 100);/* muted */
--edge:rgb(225 228 226);/* border */--rule:rgb(236 238 237);/* border-subtle */
--accent:rgb(20 83 45);/* accent */--accent-hover:rgb(22 101 52);/* accent-hover */--accent-soft:rgb(240 253 244);/* accent-soft */
--danger:rgb(180 35 50);/* danger-text */--danger-bg:rgb(255 240 241);/* danger-bg */
--warning:rgb(138 70 0);/* warning-text */--warning-bg:rgb(255 245 219);/* warning-bg */}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:var(--ground);color:var(--ink-2);display:grid;place-items:start center;padding:48px 16px}
main{width:100%;max-width:520px;background:var(--paper);border-radius:16px;padding:32px;display:grid;gap:24px;
box-shadow:0 0 0 1px rgb(11 15 13 / 6%),0 1px 2px rgb(11 15 13 / 4%),0 8px 24px -6px rgb(11 15 13 / 8%),0 32px 64px -24px rgb(11 15 13 / 12%)}
.brand{font-weight:500;color:var(--ink);margin:0}.brand b{color:var(--accent);font-weight:500}
h1{margin:0;color:var(--ink);font-family:Georgia,serif;font-weight:500;font-size:28px;line-height:36px;letter-spacing:-0.012em}
h2{margin:0;color:var(--ink);font-size:16px;line-height:24px;font-weight:500}
p{margin:0}.meta{color:var(--ink-3);font-size:12px;line-height:16px}
.stack{display:grid;gap:8px}.client{color:var(--ink);font-weight:500}
.tag{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:var(--warning-bg);color:var(--warning);font-size:12px;line-height:16px;font-weight:500}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--well);border-radius:4px;padding:2px 4px;word-break:break-all}
fieldset{border:0;margin:0;padding:0;display:grid;gap:8px}legend{padding:0;margin-bottom:8px}
.choice{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--edge);border-radius:12px}
.choice:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}
.choice.off{background:var(--well);border-color:var(--rule)}
.choice input{margin:2px 0 0;width:16px;height:16px;accent-color:var(--accent);flex:none}
.choice span{display:grid;gap:2px}.name{color:var(--ink);font-weight:500}
.terms{display:flex;gap:12px;align-items:flex-start}.terms input{margin:2px 0 0;width:16px;height:16px;accent-color:var(--accent);flex:none}
a{color:var(--accent)}a:hover{color:var(--accent-hover)}
.actions{display:flex;flex-wrap:wrap;gap:8px}
button,.button{font:inherit;font-weight:500;height:36px;padding:0 16px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;border:0}
.primary{background:var(--accent);color:var(--paper)}.primary:hover{background:var(--accent-hover);color:var(--paper)}
.secondary{background:var(--paper);color:var(--ink);box-shadow:0 0 0 1px var(--edge)}.secondary:hover{background:var(--well)}
form:not(:has(input[name=workspace_id]:checked)) button[value=approve]{opacity:.5}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.alert{background:var(--danger-bg);color:var(--danger);border-radius:12px;padding:12px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`;

function document(title: string, body: Html) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title} · CiteLadder</title>
        <style>
          ${STYLE}
        </style>
      </head>
      <body>
        <main>
          <p class="brand"><b>Cite</b>Ladder</p>
          ${body}
        </main>
      </body>
    </html>`;
}

export type ConsentView = Readonly<{
  clientName: string;
  redirectHost: string;
  redirectUri: string;
  email: string;
  transaction: string;
  csrf: string;
  workspaces: readonly ConsentWorkspace[];
  error: string | null;
  /** The Terms revision shown; a POST accepting an older one is refused. */
  termsRevision: string;
  /** The app origin, for project setup and billing links. */
  appOrigin: string;
  /** The client asked for `citeladder:write`; Allow changes is offered only then. */
  offerChanges: boolean;
}>;

/** What a write grant can do; every change is shown and confirmed first. */
const CHANGES = [
  'Add and edit topics and prompts',
  'Add competitors',
  'Launch and cancel audits',
  'Create audit schedules',
  'Update Action status and declare Actions implemented',
];

function allowChanges() {
  return html`<fieldset class="stack">
    <legend><h2>Allow changes</h2></legend>
    <label class="terms">
      <input type="checkbox" name="allow_changes" value="yes" />
      <span class="stack"
        ><span class="name">Let it make changes in workspaces where you are a Member or above</span>
        <span class="meta">${CHANGES.join(' · ')}.</span>
        <span class="meta"
          >Your assistant must show you each change and you confirm it before it happens.</span
        ></span
      >
    </label>
  </fieldset>`;
}

function workspaceChoice(view: ConsentView, workspace: ConsentWorkspace, preselect: boolean) {
  const consentPath = `/mcp/oauth/consent?transaction=${encodeURIComponent(view.transaction)}`;
  const workspaceParam = `workspace=${encodeURIComponent(workspace.id)}`;
  if (workspace.state === 'inactive' || workspace.state === 'unresolved')
    return html`<div class="choice off">
      <input type="checkbox" disabled aria-labelledby="w-${workspace.id}" />
      <span>
        <span class="name" id="w-${workspace.id}">${workspace.name}</span>
        ${
          workspace.state === 'inactive'
            ? html`<span class="meta"
                >Its trial or subscription has ended, so it cannot be shared.
                <a href="${view.appOrigin}/billing?${workspaceParam}">Review billing</a></span
              >`
            : html`<span class="meta"
                >Its access could not be confirmed right now, so it cannot be shared. Try again in a
                few minutes; contact support if this continues.</span
              >`
        }
      </span>
    </div>`;
  const setup = new URLSearchParams({ workspace: workspace.id, return_to: consentPath });
  return html`<label class="choice">
    <input
      type="checkbox"
      name="workspace_id"
      value="${workspace.id}"
      ${preselect ? html`checked required` : ''}
    />
    <span>
      <span class="name">${workspace.name}</span>
      ${
        workspace.state === 'terms'
          ? html`<span class="meta">Needs the Terms of Service accepted below.</span>`
          : ''
      }
      ${
        workspace.hasProject
          ? ''
          : html`<span class="meta"
              >No project yet. <a href="${view.appOrigin}/onboarding?${setup}">Set one up</a> and
              you will come back here.</span
            >`
      }
    </span>
  </label>`;
}

/** The approval form: who is asking, for which account, and which workspaces. */
export function consentPage(view: ConsentView) {
  const shareable = view.workspaces.filter(
    (workspace) => workspace.state === 'ready' || workspace.state === 'terms',
  );
  const needsTerms = shareable.some((workspace) => workspace.state === 'terms');
  const termsOnly = needsTerms && shareable.every((workspace) => workspace.state === 'terms');
  const consentPath = `/mcp/oauth/consent?transaction=${encodeURIComponent(view.transaction)}`;
  const setup = new URLSearchParams({ return_to: consentPath });
  return document(
    'Connect an assistant',
    html`<div class="stack">
        <h1>Connect ${view.clientName} to CiteLadder</h1>
        <p>
          <span class="client">${view.clientName}</span><span class="tag">Unverified name</span>
        </p>
        <p>
          The application chose this name; CiteLadder has not verified it. Approve only if you
          started this connection and recognize <strong>${view.redirectHost}</strong>.
        </p>
        <p class="meta">Signed in as ${view.email}</p>
      </div>
      ${view.error ? html`<p class="alert" role="alert">${view.error}</p>` : ''}
      <form method="post" action="/mcp/oauth/consent" class="stack">
        <input type="hidden" name="transaction" value="${view.transaction}" />
        <input type="hidden" name="csrf_token" value="${view.csrf}" />
        ${
          needsTerms
            ? html`<input type="hidden" name="terms_revision" value="${view.termsRevision}" />`
            : ''
        }
        ${
          view.workspaces.length
            ? html`<fieldset>
                <legend><h2>Workspaces it can use</h2></legend>
                ${view.workspaces.map((workspace) =>
                  workspaceChoice(
                    view,
                    workspace,
                    shareable.length === 1 && workspace === shareable[0],
                  ),
                )}
              </fieldset>`
            : html`<p>
                You have no workspace to share yet.
                <a href="${view.appOrigin}/onboarding?${setup}">Set up your first project</a>, then
                you will come back here to approve.
              </p>`
        }
        ${
          view.offerChanges && shareable.some((workspace) => workspace.canChange)
            ? allowChanges()
            : ''
        }
        ${
          needsTerms
            ? html`<label class="terms">
                <input
                  type="checkbox"
                  name="accept_terms"
                  value="yes"
                  ${termsOnly ? 'required' : ''}
                />
                <span
                  >I agree to the
                  <a href="${mcpPolicy.terms_url}" target="_blank" rel="noreferrer"
                    >Terms of Service</a
                  >
                  for the workspaces I share. The
                  <a href="${mcpPolicy.privacy_url}" target="_blank" rel="noreferrer"
                    >Privacy Policy</a
                  >
                  explains how we process data.</span
                >
              </label>`
            : ''
        }
        <p class="meta">
          Without Allow changes it can only read. It uses only the workspaces you select; joining
          another workspace later does not add it, and leaving one removes it. You can revoke it any
          time in Settings → MCP connections. Approving sends you back to
          <code>${view.redirectUri}</code>.
        </p>
        <div class="actions">
          ${
            shareable.length
              ? html`<button class="primary" name="decision" value="approve">
                  Approve access
                </button>`
              : ''
          }
          <button class="secondary" name="decision" value="deny" formnovalidate>Deny</button>
        </div>
      </form>`,
  );
}

/** A dead end explained, with the one way out that exists. */
export function consentMessage(input: {
  title: string;
  message: string;
  action?: { href: string; label: string };
}) {
  return document(
    input.title,
    html`<div class="stack">
      <h1>${input.title}</h1>
      <p>${input.message}</p>
      ${
        input.action
          ? html`<p class="actions">
              <a class="button primary" href="${input.action.href}">${input.action.label}</a>
            </p>`
          : ''
      }
    </div>`,
  );
}
