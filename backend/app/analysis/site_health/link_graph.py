"""Pure, bounded internal-link graph derivation over persisted page facts."""

from __future__ import annotations

import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, cast

from app.connectors.web_evidence.url_policy import canonicalize
from app.core.config.site_health_link_metrics import (
    ANCHOR_GENERIC_TEXTS,
    ANCHOR_LOW_ALIGNMENT_COVERAGE_MAX,
    ANCHOR_REPEATED_DESTINATION_MIN,
    AUTHORITY_CONVERGENCE_EPSILON,
    AUTHORITY_DAMPING_FACTOR,
    AUTHORITY_EDGE_WEIGHTS,
    AUTHORITY_MAX_ITERATIONS,
    AUTHORITY_REPEATED_ANCHOR_FACTOR,
)
from app.domain.content.lexical import lexical_tokens, normalized_coverage
from app.domain.site_health.normalization import canonical_identity


@dataclass(frozen=True, slots=True)
class LinkPageInput:
    """One crawled page and the immutable anchor facts used by the graph."""

    site_url_id: uuid.UUID
    normalized_url: str
    final_url: str
    artifact_id: uuid.UUID
    facts: dict[str, Any]
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PageLinkMetricResult:
    site_url_id: uuid.UUID
    inbound_count: int
    outbound_count: int
    main_content_inbound_count: int
    main_content_outbound_count: int
    nofollow_inbound_count: int
    depth_from_home: int | None
    source_page_count: int
    top_inbound: list[dict[str, object]]
    top_outbound: list[dict[str, object]]
    source_artifact_ids: list[uuid.UUID]
    authority_share: float
    authority_rank: int
    anchor_diagnostics: list[dict[str, object]]


@dataclass(slots=True)
class _Edge:
    source_id: uuid.UUID
    source_url: str
    target_id: uuid.UUID | None
    target_url: str
    anchor_count: int = 0
    main_content: bool = False
    has_nofollow: bool = False
    followable: bool = False
    rel_tokens: set[str] = field(default_factory=set)
    anchor_weights: list[float] = field(default_factory=list)
    anchor_facts: list[dict[str, str]] = field(default_factory=list)

    @property
    def authority_weight(self) -> float:
        """Weight one source once; repeated anchors contribute only marginally."""
        if not self.anchor_weights:
            return 0.0
        strongest = max(self.anchor_weights)
        return strongest + AUTHORITY_REPEATED_ANCHOR_FACTOR * (
            sum(self.anchor_weights) - strongest
        )


def _canonical(raw: str, *, base_url: str | None = None) -> str | None:
    try:
        absolute = canonicalize(raw, base_url=base_url)
        return canonical_identity(absolute)[0]
    except (TypeError, ValueError):
        return None


def _canonical_values(values: set[str]) -> set[str]:
    return {
        canonical
        for value in values
        if value and (canonical := _canonical(value)) is not None
    }


def _alias_map(pages: list[LinkPageInput]) -> dict[str, uuid.UUID]:
    """Prefer exact SiteUrl identities over redirect aliases.

    A redirect source and its final URL can both be crawl nodes. In that case
    the exact normalized final-URL node owns links to the final URL; redirect
    aliases fill only identities that have no exact node.
    """
    resolved: dict[str, uuid.UUID] = {}
    for page in sorted(pages, key=lambda item: str(item.site_url_id)):
        direct = _canonical(page.normalized_url)
        if direct is not None:
            resolved[direct] = page.site_url_id

    redirect_claims: dict[str, set[uuid.UUID]] = defaultdict(set)
    for page in pages:
        for alias in _canonical_values({page.final_url, *page.aliases}):
            if alias not in resolved:
                redirect_claims[alias].add(page.site_url_id)
    for alias, claimants in redirect_claims.items():
        if len(claimants) == 1:
            resolved[alias] = next(iter(claimants))
    return resolved


def _rel_tokens(raw: object) -> set[str]:
    if isinstance(raw, list):
        values = raw
    else:
        values = str(raw or "").replace(",", " ").split()
    return {str(value).strip().lower() for value in values if str(value).strip()}


def _page_anchors(page: LinkPageInput) -> list[dict[str, Any]]:
    links = page.facts.get("links") or {}
    if not isinstance(links, dict):
        return []
    anchors = links.get("anchors") or []
    if not isinstance(anchors, list):
        return []
    return [anchor for anchor in anchors if isinstance(anchor, dict)]


def _page_is_nofollow(page: LinkPageInput) -> bool:
    robots = page.facts.get("robots") or {}
    return bool(robots.get("nofollow")) if isinstance(robots, dict) else False


def _anchor_target(
    page: LinkPageInput,
    anchor: dict[str, Any],
    aliases: dict[str, uuid.UUID],
    node_urls: dict[uuid.UUID, str],
) -> tuple[uuid.UUID | None, str] | None:
    if not anchor.get("is_internal"):
        return None
    target_url = _canonical(str(anchor.get("url") or ""), base_url=page.final_url)
    if target_url is None:
        return None
    target_id = aliases.get(target_url)
    return target_id, node_urls[target_id] if target_id is not None else target_url


def _update_edge(edge: _Edge, anchor: dict[str, Any], *, page_nofollow: bool) -> None:
    tokens = _rel_tokens(anchor.get("rel"))
    nofollow = page_nofollow or "nofollow" in tokens
    main_content = anchor.get("region") == "main"
    edge.anchor_count += 1
    edge.main_content = edge.main_content or main_content
    edge.has_nofollow = edge.has_nofollow or nofollow
    edge.followable = edge.followable or not nofollow
    edge.rel_tokens.update(tokens & {"nofollow", "sponsored", "ugc"})
    edge.anchor_weights.append(AUTHORITY_EDGE_WEIGHTS[(main_content, not nofollow)])
    edge.anchor_facts.append(
        {
            "text": str(anchor.get("anchor_text") or ""),
            "region": str(anchor.get("region") or "unknown"),
        }
    )


def _merge_anchor(
    by_target: dict[tuple[str, str], _Edge],
    *,
    page: LinkPageInput,
    anchor: dict[str, Any],
    aliases: dict[str, uuid.UUID],
    node_urls: dict[uuid.UUID, str],
    page_nofollow: bool,
) -> None:
    target = _anchor_target(page, anchor, aliases, node_urls)
    if target is None:
        return
    target_id, target_url = target
    target_key = str(target_id) if target_id is not None else target_url
    edge = by_target.setdefault(
        ("node" if target_id is not None else "url", target_key),
        _Edge(
            source_id=page.site_url_id,
            source_url=page.normalized_url,
            target_id=target_id,
            target_url=target_url,
        ),
    )
    _update_edge(edge, anchor, page_nofollow=page_nofollow)


def _page_edges(
    page: LinkPageInput,
    aliases: dict[str, uuid.UUID],
    node_urls: dict[uuid.UUID, str],
) -> list[_Edge]:
    by_target: dict[tuple[str, str], _Edge] = {}
    page_nofollow = _page_is_nofollow(page)
    for anchor in _page_anchors(page):
        _merge_anchor(
            by_target,
            page=page,
            anchor=anchor,
            aliases=aliases,
            node_urls=node_urls,
            page_nofollow=page_nofollow,
        )
    return sorted(by_target.values(), key=lambda item: item.target_url)


def _node_urls(pages: list[LinkPageInput]) -> dict[uuid.UUID, str]:
    representatives: dict[uuid.UUID, str] = {}
    for page in pages:
        normalized = _canonical(page.normalized_url)
        representatives[page.site_url_id] = normalized or page.normalized_url
    return representatives


def _depths(
    home_id: uuid.UUID | None,
    outgoing: dict[uuid.UUID, list[_Edge]],
) -> dict[uuid.UUID, int]:
    if home_id is None:
        return {}
    depths = {home_id: 0}
    queue: deque[uuid.UUID] = deque([home_id])
    while queue:
        source_id = queue.popleft()
        for edge in outgoing[source_id]:
            target_id = edge.target_id
            if not edge.followable or target_id is None or target_id in depths:
                continue
            depths[target_id] = depths[source_id] + 1
            queue.append(target_id)
    return depths


def _neighbour_row(edge: _Edge, *, inbound: bool) -> dict[str, object]:
    site_url_id: uuid.UUID | None
    if inbound:
        site_url_id = edge.source_id
        url = edge.source_url
    else:
        site_url_id = edge.target_id
        url = edge.target_url
    return {
        "site_url_id": str(site_url_id) if site_url_id is not None else None,
        "url": url,
        "anchor_count": edge.anchor_count,
        "main_content": edge.main_content,
        "nofollow": edge.has_nofollow,
        "rel": sorted(edge.rel_tokens),
    }


def _top_neighbours(
    edges: list[_Edge], *, inbound: bool, limit: int
) -> list[dict[str, object]]:
    ordered = sorted(
        edges,
        key=lambda edge: (
            -edge.anchor_count,
            -int(edge.main_content),
            edge.source_url if inbound else edge.target_url,
            str(edge.source_id if inbound else edge.target_id or ""),
        ),
    )
    return [_neighbour_row(edge, inbound=inbound) for edge in ordered[:limit]]


def _observed_outgoing(
    node_ids: list[uuid.UUID], outgoing: dict[uuid.UUID, list[_Edge]]
) -> dict[uuid.UUID, list[_Edge]]:
    return {
        node_id: [edge for edge in outgoing[node_id] if edge.target_id is not None]
        for node_id in node_ids
    }


def _authority_step(
    shares: dict[uuid.UUID, float],
    node_ids: list[uuid.UUID],
    observed_edges: dict[uuid.UUID, list[_Edge]],
) -> dict[uuid.UUID, float]:
    count = len(node_ids)
    next_shares = {
        node_id: (1.0 - AUTHORITY_DAMPING_FACTOR) / count for node_id in node_ids
    }
    dangling = sum(
        shares[node_id] for node_id, edges in observed_edges.items() if not edges
    )
    dangling_share = AUTHORITY_DAMPING_FACTOR * dangling / count
    for node_id in node_ids:
        next_shares[node_id] += dangling_share
    for source_id, edges in observed_edges.items():
        if not edges:
            continue
        total_weight = sum(edge.authority_weight for edge in edges)
        for edge in edges:
            target_id = edge.target_id
            if target_id is not None:
                next_shares[target_id] += (
                    AUTHORITY_DAMPING_FACTOR
                    * shares[source_id]
                    * edge.authority_weight
                    / total_weight
                )
    total = sum(next_shares.values())
    return {node_id: value / total for node_id, value in next_shares.items()}


def _authority_converged(
    before: dict[uuid.UUID, float], after: dict[uuid.UUID, float]
) -> bool:
    delta = sum(abs(after[node_id] - value) for node_id, value in before.items())
    return delta <= AUTHORITY_CONVERGENCE_EPSILON


def _authority_shares(
    node_ids: list[uuid.UUID], outgoing: dict[uuid.UUID, list[_Edge]]
) -> dict[uuid.UUID, float]:
    """Weighted power iteration over observed nodes with explicit dangling flow."""
    if not node_ids:
        return {}
    shares = {node_id: 1.0 / len(node_ids) for node_id in node_ids}
    observed_edges = _observed_outgoing(node_ids, outgoing)
    for _ in range(AUTHORITY_MAX_ITERATIONS):
        next_shares = _authority_step(shares, node_ids, observed_edges)
        if _authority_converged(shares, next_shares):
            return next_shares
        shares = next_shares
    return shares


def _normalized_anchor_text(value: object) -> str:
    return " ".join(str(value or "").casefold().split())


def _anchor_specs(
    text: str,
    target: LinkPageInput | None,
    destinations: set[str],
) -> list[tuple[str, float | None, float | None]]:
    specs: list[tuple[str, float | None, float | None]] = []
    if text in ANCHOR_GENERIC_TEXTS or text.startswith(("http://", "https://", "www.")):
        specs.append(("generic", None, None))
    if len(destinations) >= ANCHOR_REPEATED_DESTINATION_MIN:
        specs.append(("repeated_destination", None, None))
    terms = lexical_tokens(text, min_length=1)
    if target is None or not terms:
        return specs
    target_facts = target.facts
    headings = target_facts.get("headings") or {}
    title_coverage = normalized_coverage(terms, target_facts.get("title"))
    h1_coverage = normalized_coverage(terms, " ".join(headings.get("h1_texts") or []))
    if (
        title_coverage is not None
        and h1_coverage is not None
        and title_coverage <= ANCHOR_LOW_ALIGNMENT_COVERAGE_MAX
        and h1_coverage <= ANCHOR_LOW_ALIGNMENT_COVERAGE_MAX
    ):
        specs.append(
            (
                "low_lexical_alignment",
                round(title_coverage, 6),
                round(h1_coverage, 6),
            )
        )
    return specs


def _add_anchor_diagnostic(
    grouped: dict[tuple[str, str, str], dict[str, object]],
    *,
    kind: str,
    text: str,
    edge: _Edge,
    region: str,
    destinations: set[str],
    title_coverage: float | None,
    h1_coverage: float | None,
) -> None:
    key = (kind, text, edge.target_url if kind == "low_lexical_alignment" else "")
    row = grouped.setdefault(
        key,
        {
            "kind": kind,
            "anchor_text": text,
            "occurrences": 0,
            "destination_count": (
                1 if kind == "low_lexical_alignment" else len(destinations)
            ),
            "destinations": (
                [edge.target_url]
                if kind == "low_lexical_alignment"
                else sorted(destinations)
            ),
            "regions": set(),
            "title_coverage": title_coverage,
            "h1_coverage": h1_coverage,
        },
    )
    row["occurrences"] = cast(int, row["occurrences"]) + 1
    cast(set[str], row["regions"]).add(region)


def _diagnose_edge(
    grouped: dict[tuple[str, str, str], dict[str, object]],
    edge: _Edge,
    *,
    target: LinkPageInput | None,
    destinations_by_text: dict[str, set[str]],
) -> None:
    for fact in edge.anchor_facts:
        text = _normalized_anchor_text(fact.get("text"))
        if not text:
            continue
        destinations = destinations_by_text.get(text, set())
        for kind, title_coverage, h1_coverage in _anchor_specs(
            text, target, destinations
        ):
            _add_anchor_diagnostic(
                grouped,
                kind=kind,
                text=text,
                edge=edge,
                region=str(fact.get("region") or "unknown"),
                destinations=destinations,
                title_coverage=title_coverage,
                h1_coverage=h1_coverage,
            )


def _anchor_diagnostics(
    edges: list[_Edge],
    *,
    pages_by_id: dict[uuid.UUID, LinkPageInput],
    destinations_by_text: dict[str, set[str]],
) -> list[dict[str, object]]:
    grouped: dict[tuple[str, str, str], dict[str, object]] = {}
    for edge in edges:
        target = pages_by_id.get(edge.target_id) if edge.target_id is not None else None
        _diagnose_edge(
            grouped,
            edge,
            target=target,
            destinations_by_text=destinations_by_text,
        )
    result = []
    for key in sorted(grouped):
        row = grouped[key]
        row["regions"] = sorted(cast(set[str], row["regions"]))
        result.append(row)
    return result


def _inbound_edges(
    outgoing: dict[uuid.UUID, list[_Edge]],
) -> dict[uuid.UUID, list[_Edge]]:
    inbound: dict[uuid.UUID, list[_Edge]] = defaultdict(list)
    for edges in outgoing.values():
        for edge in edges:
            if edge.target_id is not None:
                inbound[edge.target_id].append(edge)
    return inbound


def _anchor_destinations(
    outgoing: dict[uuid.UUID, list[_Edge]],
) -> dict[str, set[str]]:
    destinations: dict[str, set[str]] = defaultdict(set)
    for edges in outgoing.values():
        for edge in edges:
            for fact in edge.anchor_facts:
                text = _normalized_anchor_text(fact.get("text"))
                if text:
                    destinations[text].add(edge.target_url)
    return destinations


def _authority_ranks(
    node_ids: list[uuid.UUID], shares: dict[uuid.UUID, float]
) -> dict[uuid.UUID, int]:
    ranked = sorted(node_ids, key=lambda item: (-shares[item], str(item)))
    return {node_id: rank for rank, node_id in enumerate(ranked, start=1)}


def _page_metric(
    page: LinkPageInput,
    *,
    outgoing: dict[uuid.UUID, list[_Edge]],
    inbound: dict[uuid.UUID, list[_Edge]],
    depths: dict[uuid.UUID, int],
    source_artifact_ids: list[uuid.UUID],
    pages_by_id: dict[uuid.UUID, LinkPageInput],
    destinations_by_text: dict[str, set[str]],
    authority_shares: dict[uuid.UUID, float],
    authority_ranks: dict[uuid.UUID, int],
    neighbour_limit: int,
) -> PageLinkMetricResult:
    page_outbound = outgoing[page.site_url_id]
    page_inbound = inbound[page.site_url_id]
    return PageLinkMetricResult(
        site_url_id=page.site_url_id,
        inbound_count=len(page_inbound),
        outbound_count=len(page_outbound),
        main_content_inbound_count=sum(edge.main_content for edge in page_inbound),
        main_content_outbound_count=sum(edge.main_content for edge in page_outbound),
        nofollow_inbound_count=sum(edge.has_nofollow for edge in page_inbound),
        depth_from_home=depths.get(page.site_url_id),
        source_page_count=len(pages_by_id),
        top_inbound=_top_neighbours(page_inbound, inbound=True, limit=neighbour_limit),
        top_outbound=_top_neighbours(
            page_outbound, inbound=False, limit=neighbour_limit
        ),
        source_artifact_ids=source_artifact_ids,
        authority_share=authority_shares[page.site_url_id],
        authority_rank=authority_ranks[page.site_url_id],
        anchor_diagnostics=_anchor_diagnostics(
            page_outbound,
            pages_by_id=pages_by_id,
            destinations_by_text=destinations_by_text,
        ),
    )


def build_link_metrics(
    pages: list[LinkPageInput], *, home_url: str, neighbour_limit: int
) -> list[PageLinkMetricResult]:
    """Collapse duplicate links, resolve crawl nodes, and derive page metrics."""
    ordered_pages = sorted(pages, key=lambda item: str(item.site_url_id))
    aliases = _alias_map(ordered_pages)
    node_urls = _node_urls(ordered_pages)
    outgoing = {
        page.site_url_id: _page_edges(page, aliases, node_urls)
        for page in ordered_pages
    }
    canonical_home = _canonical(home_url)
    home_id = aliases.get(canonical_home) if canonical_home is not None else None
    node_ids = [page.site_url_id for page in ordered_pages]
    authority_shares = _authority_shares(node_ids, outgoing)
    inbound = _inbound_edges(outgoing)
    depths = _depths(home_id, outgoing)
    source_artifact_ids = sorted({page.artifact_id for page in ordered_pages}, key=str)
    pages_by_id = {page.site_url_id: page for page in ordered_pages}
    destinations_by_text = _anchor_destinations(outgoing)
    authority_ranks = _authority_ranks(node_ids, authority_shares)
    return [
        _page_metric(
            page,
            outgoing=outgoing,
            inbound=inbound,
            depths=depths,
            source_artifact_ids=source_artifact_ids,
            pages_by_id=pages_by_id,
            destinations_by_text=destinations_by_text,
            authority_shares=authority_shares,
            authority_ranks=authority_ranks,
            neighbour_limit=max(0, neighbour_limit),
        )
        for page in ordered_pages
    ]


__all__ = ["LinkPageInput", "PageLinkMetricResult", "build_link_metrics"]
