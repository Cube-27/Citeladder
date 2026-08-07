# Commerce intelligence

Commerce is the second validated industry profile, not a separate product architecture. It reuses
the same corpus, page understanding, knowledge, opportunity, brief, demand, prompt, verification,
and Growth Agent contracts as Education and every later industry.

## Existing foundation

CiteLadder already stores project-scoped owned and competitor catalog identities and derives
product-level mention/visibility evidence from immutable answer-engine artifacts. Those models are
specialized identity/evidence sources; they do not become the universal knowledge model.

Existing `/products` catalog and visibility deep links remain available while future views migrate
into Site, Content, and Demand Intelligence.

## Commerce profile scope

Initial industry roles include:

- organization/store identity;
- category or collection;
- product detail and product family/variant;
- offer and availability;
- comparison and buying guide;
- FAQ/support;
- shipping, returns, warranty, privacy, and policy;
- review/proof and editorial discovery content.

Expected entities include product, family, variant, brand, category, identifier, attribute, offer,
availability, price, policy, audience, use case, question, and journey stage.

## Deterministic analysis

Commerce classification and checks compare visible evidence, structured data, and reviewed catalog
identity. Deterministic identity order prefers GTIN and other exact identifiers, then configured
brand/model/SKU/family/variant evidence. Ambiguous matches require review and accepted mappings are
versioned rather than silently overwritten.

Typical deterministic gaps:

- missing or conflicting Product/Offer identity;
- price, currency, availability, shipping, or return-policy mismatch;
- variant/family ambiguity;
- category hierarchy, breadcrumb, pagination, or product-reachability gaps;
- thin category guidance or product specifications;
- missing use, compatibility, limitation, care, safety, or support answers;
- stale/discontinued evidence presented as current;
- duplicate product/category intent;
- missing visible/schema parity.

Unknown price, stock, rating, identifier, policy, or safety facts are not invented.

## Commerce journeys

The baseline journey is discovery → category evaluation → product consideration → offer/variant
selection → cart/checkout handoff → purchase → delivery/support/return. Each project configures the
outcomes and analytics events it actually supports. Missing events remain unavailable.

## FAQ-first workflow

Commerce FAQ families cover suitability and use, specifications/materials, compatibility,
variants, availability, delivery, returns, warranty, care, limitations, safety, and category
selection. A page role determines which questions are expected; verified catalog and site
assertions determine which answers are permitted.

## Demand and visibility

Demand Intelligence connects query-to-category/PDP fit, landing behavior, configured commerce key
events, active prompts, product mentions/citations, and later comparable snapshots. It does not
sum incompatible GA4 report grains or claim causal revenue impact from correlation alone.

## Evaluation

Commerce requires synthetic and opt-in representative fixtures covering category, PDP, variants,
offers, comparison, FAQ, and policy pages; identifier/price/availability conflicts; discontinued
items; and visible/schema parity. A large marketplace is an acquisition stress test, not the
initial product model.

Historical commerce-suite architecture is retained under `archive/plans/commerce-suite/` and
`archive/subsystems/commerce-intelligence-visibility-era.md` only for migration context.
