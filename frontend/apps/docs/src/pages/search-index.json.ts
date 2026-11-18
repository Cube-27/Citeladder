import { sitePages } from '../lib/site-pages';

export function GET() {
  return Response.json(sitePages);
}
