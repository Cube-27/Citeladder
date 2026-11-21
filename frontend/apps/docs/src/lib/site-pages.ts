import { API_GROUP, articleSearchBody, articles } from './content';
import { API_OPERATIONS, API_SCHEMAS } from './api-reference';

export const API_ENDPOINTS_HREF = '/api/endpoints/';

export const sitePages = [
  ...articles.map((article) => ({
    title: article.title,
    description: article.description,
    group: article.group,
    href: article.href,
    body: articleSearchBody(article),
  })),
  {
    title: 'Endpoints',
    description: 'Every public API endpoint, grouped by resource.',
    group: API_GROUP,
    href: API_ENDPOINTS_HREF,
    body: API_OPERATIONS.map((operation) => `${operation.method} ${operation.path}`).join('\n'),
  },
  ...API_OPERATIONS.map((operation) => ({
    title: operation.summary,
    description: operation.description,
    group: API_GROUP,
    href: operation.href,
    body: [
      `${operation.method} ${operation.path}`,
      operation.resource.label,
      operation.scope ?? '',
      ...operation.parameters.flatMap((group) => group.rows.map((row) => row.name)),
      ...(operation.request?.rows.map((row) => row.name) ?? []),
      ...(operation.response.body?.rows.map((row) => row.name) ?? []),
    ].join('\n'),
  })),
  ...API_SCHEMAS.map((schema) => ({
    title: schema.name,
    description: schema.description,
    group: API_GROUP,
    href: schema.href,
    body: schema.rows.map((row) => row.name).join('\n'),
  })),
];
