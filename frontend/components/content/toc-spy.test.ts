import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mountTocSpy } from './toc-spy';

type Report = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { report: Report; targets: Element[]; rootMargin?: string }[] = [];

class FakeObserver {
  targets: Element[] = [];
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    observers.push({
      targets: this.targets,
      rootMargin: options?.rootMargin,
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

/** A Toc page; `barBottom` adds a top bar whose bottom edge sits that far down the viewport. */
function page({ barBottom }: { barBottom?: number } = {}) {
  document.body.innerHTML = `
    ${barBottom === undefined ? '' : '<header data-site-nav></header>'}
    <nav class="cl-toc">
      <a class="cl-toc-link" href="#intro">Intro</a>
      <a class="cl-toc-link" href="#setup">Setup</a>
      <a class="cl-toc-link" href="#faq">FAQ</a>
    </nav>
    <article><h2 id="intro">Intro</h2><h2 id="setup">Setup</h2><h2 id="faq">FAQ</h2></article>`;
  const bar = document.querySelector('header');
  if (bar) vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ bottom: barBottom } as DOMRect);
  mountTocSpy();
  const headings = observers.find((observer) => observer.targets.length === 3);
  const end = observers.find((observer) => observer.targets[0]?.tagName === 'DIV');
  const content = observers.find((observer) => observer.targets[0]?.tagName === 'ARTICLE');
  const current = () =>
    [...document.querySelectorAll('[aria-current="location"]')].map((node) => node.textContent);
  const reach = (...ids: string[]) =>
    headings!.report(
      ['intro', 'setup', 'faq'].map((id) => ({
        target: document.getElementById(id)!,
        isIntersecting: ids.includes(id),
      })),
    );
  return { current, reach, end: end!, headings: headings!, content: content! };
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

  it('activates a heading a third down the viewport, or under a top bar that reaches lower', () => {
    // jsdom's viewport is 768px tall: the band ends 1px past the reading line.
    expect(page().headings.rootMargin).toBe('100000% 0px -511px 0px');
    observers.length = 0;
    expect(page({ barBottom: 100 }).headings.rootMargin).toBe('100000% 0px -511px 0px');
    observers.length = 0;
    expect(page({ barBottom: 300 }).headings.rootMargin).toBe('100000% 0px -467px 0px');
  });

  it('marks the last heading once the content holding it has ended in view', () => {
    const { current, reach, content } = page();
    reach('intro');
    const report = (scrollY: number, entry: Partial<IntersectionObserverEntry>) => {
      window.scrollY = scrollY;
      content.report([
        { target: content.targets[0], rootBounds: { top: 767 } as DOMRectReadOnly, ...entry },
      ]);
    };

    report(900, { isIntersecting: true, boundingClientRect: { bottom: 800 } as DOMRectReadOnly });
    expect(current()).toEqual(['Intro']);

    report(900, { isIntersecting: false, boundingClientRect: { bottom: 600 } as DOMRectReadOnly });
    expect(current()).toEqual(['FAQ']);

    // Content still below the band, or an unscrolled page, has not ended.
    report(900, { isIntersecting: false, boundingClientRect: { bottom: 2000 } as DOMRectReadOnly });
    expect(current()).toEqual(['Intro']);
    report(0, { isIntersecting: false, boundingClientRect: { bottom: 600 } as DOMRectReadOnly });
    expect(current()).toEqual(['Intro']);

    // Back at the top with no crossing reported, the ended content no longer counts.
    report(900, { isIntersecting: false, boundingClientRect: { bottom: 600 } as DOMRectReadOnly });
    expect(current()).toEqual(['FAQ']);
    window.scrollY = 0;
    window.dispatchEvent(new Event('scroll'));
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

  it('scrolls a rail shown by a resize to its marked link, already marked while hidden', () => {
    document.body.innerHTML = `
      <div data-toc-scroll><ol class="cl-toc-list">
        <li><a class="cl-toc-link" href="#intro">Intro</a></li>
        <li><a class="cl-toc-link" href="#setup">Setup</a></li>
      </ol></div>
      <article><h2 id="intro">Intro</h2><h2 id="setup">Setup</h2></article>`;
    const list = document.querySelector<HTMLElement>('.cl-toc-list')!;
    const setup = document.querySelector<HTMLElement>('[href="#setup"]')!;
    const box = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(box(0, 200));
    vi.spyOn(setup, 'getBoundingClientRect').mockReturnValue(box(300, 330));
    mountTocSpy();
    const reachSetup = () =>
      observers
        .findLast((observer) => observer.targets.length === 2)!
        .report([{ target: document.getElementById('setup')!, isIntersecting: true }]);

    // Hidden below the rail's breakpoint, nothing scrolls.
    reachSetup();
    expect(setup.getAttribute('aria-current')).toBe('location');
    expect(list.scrollTop).toBe(0);

    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 });
    window.dispatchEvent(new Event('resize'));
    reachSetup();
    expect(list.scrollTop).toBe(146);
  });
});
