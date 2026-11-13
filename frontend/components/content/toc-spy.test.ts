import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mountTocSpy } from './toc-spy';

type Report = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { report: Report; targets: Element[] }[] = [];

class FakeObserver {
  targets: Element[] = [];
  constructor(callback: IntersectionObserverCallback) {
    observers.push({
      targets: this.targets,
      report: (entries) =>
        callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver),
    });
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  disconnect() {
    this.targets.length = 0;
  }
}

function page() {
  document.body.innerHTML = `
    <nav class="cl-toc">
      <a class="cl-toc-link" href="#intro">Intro</a>
      <a class="cl-toc-link" href="#setup">Setup</a>
      <a class="cl-toc-link" href="#faq">FAQ</a>
    </nav>
    <h2 id="intro">Intro</h2><h2 id="setup">Setup</h2><h2 id="faq">FAQ</h2>`;
  mountTocSpy();
  const headings = observers.find((observer) => observer.targets.length === 3);
  const end = observers.find((observer) => observer.targets.length === 1);
  const current = () =>
    [...document.querySelectorAll('[aria-current="location"]')].map((node) => node.textContent);
  const reach = (...ids: string[]) =>
    headings!.report(
      ['intro', 'setup', 'faq'].map((id) => ({
        target: document.getElementById(id)!,
        isIntersecting: ids.includes(id),
      })),
    );
  return { current, reach, end: end! };
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
  window.scrollY = 0;
  document.body.innerHTML = '';
});

describe('Toc scrollspy', () => {
  it('marks the last heading whose top has reached the landing line', () => {
    const { current, reach } = page();
    expect(current()).toEqual(['Intro']);

    reach('intro', 'setup');
    expect(current()).toEqual(['Setup']);

    reach('intro');
    expect(current()).toEqual(['Intro']);
  });

  it('marks the last heading once a scrolled page reaches its end', () => {
    const { current, reach, end } = page();
    reach('intro');

    window.scrollY = 0;
    end.report([{ target: end.targets[0], isIntersecting: true }]);
    expect(current()).toEqual(['Intro']);

    window.scrollY = 900;
    end.report([{ target: end.targets[0], isIntersecting: true }]);
    expect(current()).toEqual(['FAQ']);

    end.report([{ target: end.targets[0], isIntersecting: false }]);
    expect(current()).toEqual(['Intro']);
  });
});
