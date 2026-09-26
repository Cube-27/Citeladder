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

  it('sorts a regexp matcher behind every single-path matcher', () => {
    const snippet = `
@backend path /api /api/*
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
});
