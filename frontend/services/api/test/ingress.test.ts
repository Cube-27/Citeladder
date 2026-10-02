/**
 * The ingress model must reproduce Caddy's handler order, since the gate's
 * verdict is only as good as its answer to "which upstream gets this path?".
 */
import { describe, expect, it } from 'vitest';

import { ingressRouter } from '../src/openapi/ingress.ts';

const UPSTREAMS = { python: ['BACKEND_ORIGIN'], typescript: ['API_SERVICE_ORIGIN'] };
const EXECUTION = '/api/v1/executions/00000000-0000-4000-8000-000000000000';
const PROJECT = '/api/v1/projects/00000000-0000-4000-8000-000000000000';

function reach(source: string, path: string) {
  return [...ingressRouter(source, UPSTREAMS)(path)].sort();
}

describe('ingress routing model', () => {
  it('recognizes only exact configured upstream identities', () => {
    const upstreams = { ...UPSTREAMS, typescript: ['API_SERVICE_ORIGIN', '127.0.0.1:8100'] };
    for (const endpoint of ['127.0.0.1:8100', '{$API_SERVICE_ORIGIN:api-service:8100}']) {
      expect([...ingressRouter(`reverse_proxy ${endpoint}`, upstreams)(PROJECT)]).toEqual([
        'typescript',
      ]);
    }
    for (const endpoint of [
      'unrelated:8100',
      'API_SERVICE_ORIGIN.example:8100',
      '{$API_SERVICE_ORIGIN_OTHER:127.0.0.1:8100}',
    ]) {
      expect([...ingressRouter(`reverse_proxy ${endpoint}`, upstreams)(PROJECT)]).toEqual([
        'other',
      ]);
    }
  });

  it('sorts a longer single-path matcher ahead of the catch-all API matcher', () => {
    const snippet = `
@backend path /api /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
@ts_api path /api/v1/executions/*
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
reverse_proxy {$MARKETING_ORIGIN:127.0.0.1:3000}
`;
    expect(reach(snippet, EXECUTION)).toEqual(['typescript']);
    expect(reach(snippet, PROJECT)).toEqual(['python']);
    expect(reach(snippet, '/pricing')).toEqual(['other']);
  });

  it('keeps written order when neither matcher holds exactly one path', () => {
    const snippet = `
@backend path /api /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
@ts_api path /api/v1/executions /api/v1/executions/*
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
`;
    expect(reach(snippet, EXECUTION)).toEqual(['python']);
  });

  it('refuses a directive that could reroute a path', () => {
    const snippet = `
rewrite /api/v1/executions/* /api/v1/runs{uri}
reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000}
`;
    expect(() => reach(snippet, EXECUTION)).toThrow("Unsupported directive 'rewrite' at line 2");
  });

  it('sorts a regexp matcher behind a single-path matcher', () => {
    const snippet = `
@backend path /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
@ts_api path_regexp ts ^/api/v1/executions/[^/]+$
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
`;
    expect(reach(snippet, EXECUTION)).toEqual(['python']);
  });

  it('keeps written order inside route, so an earlier handle shadows a later one', () => {
    const site = `
https://origin.example {
  @api path /api/*
  @ts_api path /api/v1/executions/*
  route {
    handle @api {
      reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000}
    }
    handle @ts_api {
      reverse_proxy {$API_SERVICE_ORIGIN:127.0.0.1:8100}
    }
    respond 404
  }
}
`;
    expect(reach(site, EXECUTION)).toEqual(['python']);
  });

  it('explores both outcomes of a header matcher', () => {
    const site = `
{
  admin off
}
https://origin.example {
  @apex header X-Public-Host apex.example
  @app header X-Public-Host app.example
  @ts_api path /api/v1/executions/*
  route {
    handle @apex {
      handle @ts_api {
        reverse_proxy {$API_SERVICE_ORIGIN:127.0.0.1:8100}
      }
      reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000}
    }
    handle @app {
      reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000} {
        header_up Host app.example
      }
    }
    respond 403
  }
}
`;
    expect(reach(site, EXECUTION)).toEqual(['python', 'respond', 'typescript']);
    expect(reach(site, PROJECT)).toEqual(['python', 'respond']);
  });

  it("applies Caddy's shape precedence before globbing a path pattern", () => {
    const snippet = `
@backend path /api/*
reverse_proxy @backend {$BACKEND_ORIGIN:127.0.0.1:8000}
@ts_prefix path /api/v1/executions/*
reverse_proxy @ts_prefix {$API_SERVICE_ORIGIN:127.0.0.1:8100}
@ts_glob path /api/v1/projects/*/ai-referrals
reverse_proxy @ts_glob {$API_SERVICE_ORIGIN:127.0.0.1:8100}
`;
    // A trailing wildcard is a prefix match, so it crosses segments.
    expect(reach(snippet, `${EXECUTION}/events`)).toEqual(['typescript']);
    // A mid-path wildcard is path.Match: one segment, never across '/'.
    expect(reach(snippet, `${PROJECT}/ai-referrals`)).toEqual(['typescript']);
    expect(reach(snippet, `${PROJECT}/x/ai-referrals`)).toEqual(['python']);
    expect(reach(snippet, `${PROJECT.toUpperCase()}/AI-REFERRALS`)).toEqual(['typescript']);
  });

  it('globs a pattern with more than one wildcard, as Caddy does', () => {
    const snippet = `
@ts_api path /api/v1/projects/*/visibility*
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000}
`;
    expect(reach(snippet, `${PROJECT}/visibility-trends`)).toEqual(['typescript']);
    // The trailing wildcard of a glob stays inside its segment.
    expect(reach(snippet, `${PROJECT}/visibility/sources`)).toEqual(['python']);
  });

  it('matches the cleaned request path, as Caddy does', () => {
    const snippet = `
@ts_api path /api/v1/projects/*/ai-referrals
reverse_proxy @ts_api {$API_SERVICE_ORIGIN:127.0.0.1:8100}
reverse_proxy {$BACKEND_ORIGIN:127.0.0.1:8000}
`;
    const messy = PROJECT.replace('/api/v1/', '/api//v1/./x/../');
    expect(reach(snippet, `${messy}/ai-referrals`)).toEqual(['typescript']);
    expect(() =>
      reach(
        `@x path /api/v?
respond @x 404`,
        '/api/v1',
      ),
    ).toThrow("Unsupported Caddy path pattern '/api/v?'");
  });
});
