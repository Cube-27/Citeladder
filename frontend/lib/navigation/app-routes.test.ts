import { CREDENTIAL_LINK_PATHS } from '@citeladder/contracts/route-ownership';
import { describe, expect, it } from 'vite-plus/test';

import {
  APP_ROUTES,
  hasPageTitle,
  isWorkspaceOnlyRoute,
  isAgentPath,
  projectSwitchPathname,
  resolveTitle,
} from './app-routes';

describe('app route manifest', () => {
  it('titles a page by its own route, else by the section it sits below', () => {
    expect(resolveTitle('/runs/1f0c')).toBe('Run');
    expect(resolveTitle('/site/crawls/c1/pages/p1')).toBe('Page detail');
    expect(resolveTitle('/agent/chats/c1')).toBe('Chat');
    expect(resolveTitle('/products/overview')).toBe('Shopping');
    expect(resolveTitle('/settings/unknown')).toBe('Settings');
    expect(resolveTitle('/nowhere')).toBe('CiteLadder');
  });

  it('gives only titled shell pages a loading frame', () => {
    expect(hasPageTitle('/issues')).toBe(true);
    expect(hasPageTitle('/invitations/accept')).toBe(false);
    expect(hasPageTitle('/onboarding')).toBe(false);
  });

  it('lets workspace pages render with no project and nothing else', () => {
    expect(isWorkspaceOnlyRoute('/billing')).toBe(true);
    expect(isWorkspaceOnlyRoute('/invitations/accept')).toBe(true);
    expect(isWorkspaceOnlyRoute('/workspaces')).toBe(true);
    expect(isWorkspaceOnlyRoute('/prompts')).toBe(false);
    expect(isWorkspaceOnlyRoute('/login')).toBe(false);
    expect(isWorkspaceOnlyRoute(null)).toBe(false);
  });

  it('lands a project switch on the collection of a record the next project lacks', () => {
    expect(projectSwitchPathname('/runs/r1')).toBe('/runs');
    expect(projectSwitchPathname('/agent/chats/c1')).toBe('/agent');
    expect(projectSwitchPathname('/agent/actions/a1')).toBe('/agent/actions');
    expect(projectSwitchPathname('/site/crawls/c1/pages/p1')).toBe('/site');
    expect(projectSwitchPathname('/performance')).toBe('/performance');
  });

  it('marks exactly the routes the app host serves as credential links', () => {
    const marked = APP_ROUTES.filter((route) => 'credentialInUrl' in route).map(
      (route) => route.path,
    );
    expect(new Set(marked)).toEqual(CREDENTIAL_LINK_PATHS);
  });

  it("tells the Agent's own pages, known or not, from every other page", () => {
    expect(isAgentPath('/agent')).toBe(true);
    expect(isAgentPath('/agent/unknown')).toBe(true);
    expect(isAgentPath('/agents-report')).toBe(false);
    expect(isAgentPath('/prompts')).toBe(false);
  });
});
