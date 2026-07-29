import { serializeJsonLd, type JsonLdObject } from '@/lib/seo/json-ld';

/**
 * JSON-LD for the public marketing surface. The helpers build plain typed
 * objects from module constants — no user input reaches the serializer — and
 * `JsonLd` is the one sync server component that renders the script tag.
 *
 * The Organization block is omitted entirely while no canonical origin exists
 * (B3): an Organization without `url` is not worth emitting. FAQPage and
 * BlogPosting stay valid in that state. BlogPosting emits `datePublished` and
 * `author` only once the owner supplies them (B5).
 */

export function JsonLd({ data, id }: Readonly<{ data: JsonLdObject; id?: string }>) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
