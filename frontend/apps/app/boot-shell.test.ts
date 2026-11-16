import { afterEach, describe, expect, it } from 'vite-plus/test';

import { DASHBOARD_GROUPS, FOOT_NAV_ITEMS } from '@/components/layout/nav-items';
import * as manifest from '@/lib/navigation/app-routes';

import { bootSidebarHtml, bootTitleScript } from './boot-shell';

const script = bootTitleScript(manifest);

/** Runs the generated classic script on index.html's boot shell at a path. */
function bootAt(path: string) {
  window.history.replaceState(null, '', path);
  document.title = 'CiteLadder';
  document.body.innerHTML = `<div id="root"><div class="boot-shell"><div class="boot-side">${bootSidebarHtml(manifest)}</div><div class="boot-mast"><span class="boot-title"></span></div></div></div>`;
  new Function(script)();
  const shell = document.querySelector<HTMLElement>('.boot-shell')!;
  return {
    title: shell.querySelector('.boot-title')?.textContent ?? '',
    mode: shell.dataset.bootMode,
    width: shell.style.getPropertyValue('--boot-side-width'),
  };
}

describe('boot-title.js', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('titles every path as the mounted masthead does', () => {
    const paths = manifest.APP_ROUTES.flatMap(({ path }) => {
      const concrete = path.replaceAll(/:[^/]+/gu, 'x1');
      return [concrete, `${concrete}/deeper`];
    });
    for (const path of [...paths, '/', '/nowhere']) {
      const expected = manifest.hasPageTitle(path) ? manifest.resolveTitle(path) : '';
      expect({ path, title: bootAt(path).title }).toEqual({ path, title: expected });
    }
  });

  it('names the document and the mode on a shell page, and leaves other pages alone', () => {
    expect(bootAt('/runs/1')).toMatchObject({ title: 'Run', mode: 'dashboard' });
    expect(document.title).toBe('Run · CiteLadder');
    expect(bootAt('/agent/chats/1')).toMatchObject({ title: 'Chat', mode: 'agent' });
    expect(bootAt('/login')).toMatchObject({ title: '', mode: undefined });
    expect(document.title).toBe('CiteLadder');
  });

  it('applies the stored sidebar width within its bounds', () => {
    window.localStorage.setItem('citeladder:app:sidebar-width', '300');
    expect(bootAt('/projects').width).toBe('300px');
    window.localStorage.setItem('citeladder:app:sidebar-width', '9000');
    expect(bootAt('/projects').width).toBe('480px');
    window.localStorage.removeItem('citeladder:app:sidebar-width');
    expect(bootAt('/projects').width).toBe('');
  });
});

describe('the boot sidebar', () => {
  it('lists the live sidebar rows in order, group labels before their rows', () => {
    document.body.innerHTML = bootSidebarHtml(manifest);
    const rows = [...document.querySelectorAll('.boot-group-title, .boot-row')].map(
      (node) => node.textContent,
    );
    expect(rows).toEqual([
      ...DASHBOARD_GROUPS.flatMap((group) => [
        ...(group.title ? [group.title] : []),
        ...group.items.map((item) => item.label),
      ]),
      ...FOOT_NAV_ITEMS.map((item) => item.label),
    ]);
    expect(rows).toContain('Analyze');
  });
});
