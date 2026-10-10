import { articleSearchBody, articles } from '../lib/content';

export function GET() {
  return Response.json(
    articles.map((article) => ({
      title: article.title,
      description: article.description,
      group: article.group,
      href: article.href,
      body: articleSearchBody(article),
    })),
  );
}
