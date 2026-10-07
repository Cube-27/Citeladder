import { Bot, Check, CircleAlert, FileText, Sparkles } from 'lucide-react';
import { Pill, PanelHead } from './product-view-parts';

/** Action views: Actions, the Agent and MCP. Synthetic records only. */

export function AgentView() {
  return (
    <div className="pv-view pv-agent">
      <div className="pv-chat">
        <div className="pv-message pv-message-user">
          Prepare a developer brief for the noindex finding on /platform.
        </div>
        <div className="pv-message">
          <span className="pv-agent-name">
            <Sparkles className="size-3.5" aria-hidden /> Agent
          </span>
          <p>
            The latest crawl captured <code>noindex, follow</code> on zernovelle.example/platform.
            I’ve drafted a brief to confirm the intended policy before anyone removes it.
          </p>
          <span className="pv-step">
            <Check className="size-3" aria-hidden /> Read Site Health issue group
          </span>
          <span className="pv-step">
            <Check className="size-3" aria-hidden /> Read page evidence
          </span>
        </div>
      </div>
      <div className="pv-doc">
        <div className="pv-doc-head">
          <span className="pv-panel-title">Technical fix brief</span>
          <Pill>Revision 2</Pill>
        </div>
        <p className="pv-doc-h">Review the page indexing policy</p>
        <p className="pv-doc-p">
          Confirm whether /platform should be indexed. If yes, remove the noindex directive and
          request a fresh crawl to verify the change.
        </p>
        <p className="pv-doc-h">Evidence</p>
        <ul className="pv-doc-list">
          <li>Robots directive captured on Sep 19 crawl</li>
          <li>Page cited in 6 tracked answers</li>
        </ul>
        <div className="pv-doc-foot">
          <span className="pv-meta">Sources: Site Health · AI Visibility</span>
          <span className="pv-button pv-button-quiet">Mark implemented</span>
        </div>
      </div>
    </div>
  );
}

export function McpView() {
  return (
    <div className="pv-view pv-mcp">
      <div className="pv-message pv-message-user">
        Which pages are behind the open opportunities for zernovelle.example?
      </div>
      <div className="pv-tool-call">
        <span className="pv-tool-name">
          <Bot className="size-3.5" aria-hidden /> citeladder · read_opportunities
        </span>
        <span className="pv-meta">read-only</span>
      </div>
      <div className="pv-tool-call">
        <span className="pv-tool-name">
          <Bot className="size-3.5" aria-hidden /> citeladder · read_site_health
        </span>
        <span className="pv-meta">read-only</span>
      </div>
      <div className="pv-message">
        <p>
          Two opportunities point at <strong>/platform</strong>: the noindex finding from the latest
          crawl and a Demand signal for “workflow automation software” at position 8.4. This read
          did not recrawl the page; the crawl is from Sep 19.
        </p>
      </div>
    </div>
  );
}

export function ActionsView() {
  const actions = [
    ['/platform', 'Fix indexing policy', 'Site Health', 'High'],
    ['/guides/approvals', 'Rewrite title for CTR gap', 'Demand', 'Medium'],
    ['New page', 'Comparison page for “approval tools”', 'AI Visibility', 'Medium'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="Actions" meta="Ranked by evidence" />
        <ul className="pv-list">
          {actions.map(([target, title, source, priority]) => (
            <li key={title}>
              <CircleAlert className="text-muted size-3.5 shrink-0" aria-hidden />
              <span className="pv-list-main">
                <span>{title}</span>
                <span className="pv-meta">
                  {target} · from {source}
                </span>
              </span>
              <Pill tone={priority === 'High' ? 'warning' : 'neutral'}>{priority}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RevisionsView() {
  const revisions = [
    ['Revision 3', 'You · edited Evidence', 'Current'],
    ['Revision 2', 'Agent · revised summary', ''],
    ['Revision 1', 'Agent · outline approved', ''],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-split">
        <div className="pv-doc">
          <div className="pv-doc-head">
            <span className="pv-panel-title">Brief: approval workflows guide</span>
          </div>
          <p className="pv-doc-h">Audience</p>
          <p className="pv-doc-p">Operations leads comparing approval tools.</p>
          <p className="pv-doc-h">Angle</p>
          <p className="pv-doc-p">
            Answer “which tools support multi-step approvals” directly, with a comparison table.
          </p>
          <span className="pv-meta">Sources: 3 cited answers · 2 Demand signals</span>
        </div>
        <div className="pv-panel">
          <PanelHead title="History" />
          <ul className="pv-list">
            {revisions.map(([revision, detail, state]) => (
              <li key={revision}>
                <span className="pv-list-main">
                  <span>{revision}</span>
                  <span className="pv-meta">{detail}</span>
                </span>
                {state && <Pill tone="accent">{state}</Pill>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function SkillsView() {
  const skills = [
    ['Technical fix', 'Developer brief for one finding'],
    ['Page edit', 'Proposed changes to an existing page'],
    ['Content', 'Outline-first article or page'],
    ['Internal links', 'Link plan across your pages'],
    ['Prompt discovery', 'Proposed prompt portfolio'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="Choose a skill" meta="or let the Agent pick" />
        <ul className="pv-list">
          {skills.map(([skill, output], index) => (
            <li key={skill} data-own={index === 0 || undefined}>
              <FileText className="text-muted size-3.5 shrink-0" aria-hidden />
              <span className="pv-list-main">
                <span>{skill}</span>
                <span className="pv-meta">{output}</span>
              </span>
              {index === 0 && <Pill tone="accent">Selected</Pill>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function McpToolsView() {
  const tools = [
    ['read_visibility_overview', 'Visibility, position and competitors'],
    ['read_visibility_sources', 'Cited domains and URLs'],
    ['read_site_health', 'Crawl findings and coverage'],
    ['read_demand', 'Search Console demand signals'],
    ['read_opportunities', 'Ranked opportunities'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="CiteLadder tools" meta="read-only" />
        <ul className="pv-list">
          {tools.map(([tool, purpose]) => (
            <li key={tool}>
              <Bot className="text-muted size-3.5 shrink-0" aria-hidden />
              <span className="pv-list-main">
                <span className="pv-mono">{tool}</span>
                <span className="pv-meta">{purpose}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
