import { useState } from 'react';
import { ArrowRight, FileText, Link2, ShieldCheck } from 'lucide-react';

import { Drawer } from '@/components/ui/drawer';

export function Evidence() {
  const [selected, setSelected] = useState<'owned' | 'editorial'>('owned');
  const [open, setOpen] = useState(false);
  const source =
    selected === 'owned'
      ? {
          name: 'Platform documentation',
          url: 'zernovelle.example/platform',
          type: 'Owned',
          detail:
            'The recorded answer cites the platform page in support of shared workflows and configurable approval stages.',
        }
      : {
          name: 'Workflow platform comparison',
          url: 'fieldnotes.example/automation-guide',
          type: 'Editorial',
          detail:
            'The recorded answer cites an independent comparison discussing criteria for cross-team coordination.',
        };
  return (
    <section className="cl-section cl-evidence" id="evidence">
      <div className="cl-wrap cl-evidence-grid">
        <div>
          <h2>Analysis with a documented record.</h2>
          <p>
            Recorded answers, source references and crawl findings provide the context behind
            reported metrics.
          </p>
          <div className="cl-evidence-points">
            <div>
              <FileText size={22} aria-hidden />
              <span>
                <h3>Recorded answers</h3>
                <p>Answer content retained with engine, prompt and run context.</p>
              </span>
            </div>
            <div>
              <Link2 size={22} aria-hidden />
              <span>
                <h3>Source references</h3>
                <p>Cited domains and URLs available for inspection.</p>
              </span>
            </div>
            <div>
              <ShieldCheck size={22} aria-hidden />
              <span>
                <h3>Comparable observations</h3>
                <p>Subsequent results recorded without rewriting earlier evidence.</p>
              </span>
            </div>
          </div>
        </div>
        <div className="cl-record-stage">
          <div className="cl-record">
            <div className="cl-window-bar">
              <FileText size={14} aria-hidden /> Answer record
            </div>
            <div className="cl-record-body">
              <div className="cl-record-label">
                <span>TRACKED PROMPT</span>
                <span>ChatGPT · Sep 19</span>
              </div>
              <h3>Which workflow platforms support multi-team operations?</h3>
              <p className="cl-answer">
                Platforms in this category include <mark>Zernovelle</mark>, Brelovanta and
                Flevorynth. Zernovelle’s documentation describes shared workflows and configurable
                approval stages.<sup>[1]</sup> An independent comparison also lists cross-team
                coordination as an evaluation criterion.<sup>[2]</sup>
              </p>
              <div className="cl-record-tags">
                <span>Brand mentioned</span>
                <span>Owned source cited</span>
              </div>
              <div className="cl-record-divider">
                <span>CITED SOURCES</span>
                <span>2 RECORDS</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected('owned');
                  setOpen(true);
                }}
              >
                <span className="cl-favicon">Z</span>
                <span>
                  <b>Platform documentation</b>
                  <small>zernovelle.example/platform</small>
                </span>
                <span>Owned</span>
                <ArrowRight size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected('editorial');
                  setOpen(true);
                }}
              >
                <span className="cl-favicon">F</span>
                <span>
                  <b>Workflow platform comparison</b>
                  <small>fieldnotes.example/automation-guide</small>
                </span>
                <span>Editorial</span>
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Source record"
        closeLabel="Close source record"
        className="[&_header_button]:size-11"
      >
        <div className="cl-drawer-body">
          <span className="cl-overline">SOURCE RECORD</span>
          <h3>{source.name}</h3>
          <p>{source.detail}</p>
          <dl>
            <dt>Domain / URL</dt>
            <dd>{source.url}</dd>
            <dt>Source type</dt>
            <dd>{source.type}</dd>
            <dt>Engine</dt>
            <dd>ChatGPT</dd>
            <dt>Prompt</dt>
            <dd>Multi-team operations</dd>
            <dt>Observation</dt>
            <dd>Source cited in the answer</dd>
          </dl>
        </div>
      </Drawer>
    </section>
  );
}
