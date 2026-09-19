"""Turning one fetched third-party page into bounded, quotable facts.

Deliberately lighter than the Site Health extractor. That one is the contract
for owned-site RULES and is large because rules keep being added to it; binding
earned-source evidence to it would mean every rule change moves what we claim
about someone else's page.

Everything here is pure. Malformed HTML never raises -- a page that will not
parse yields an empty result with ``parsed=False``, which the caller reports as
poor coverage rather than as an absence.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from lxml import etree
from lxml import html as lxml_html

from app.analysis.site_health.dom import DOM_ERRORS, dom_failure
from app.analysis.source_pages.contracts import ExtractedPage
from app.connectors.web_evidence.url_policy import registrable_domain
from app.core.config.content_differentiation import (
    SOURCE_PAGE_MAX_TABLE_HEADERS,
    SOURCE_PAGE_MAX_TABLES,
)
from app.core.config.source_pages import (
    SOURCE_PAGE_MAX_HEADINGS,
    SOURCE_PAGE_MAX_OUTBOUND_DOMAINS,
    SOURCE_PAGE_MAX_STRUCTURED_TYPES,
    SOURCE_PAGE_MAX_TEXT_CHARS,
    SOURCE_PAGE_TITLE_MAX_CHARS,
)

# Subtrees whose contents are not prose. Script and style in particular must
# never reach a brief as if a publisher had written it about anyone.
_NON_PROSE_TAGS = ("script", "style", "noscript", "template", "svg", "iframe")
_HEADING_TAGS = ("h1", "h2", "h3")
# Real schema.org graphs nest a few levels; anything deeper is not data.
_MAX_SCHEMA_DEPTH = 12


def _safe_parser_encoding(charset: str) -> str | None:
    value = (charset or "").strip()
    if not value:
        return None
    try:
        "".encode(value)
    except LookupError:
        return None
    return value


def _prune_non_prose(node: Any) -> None:
    try:
        for tag in _NON_PROSE_TAGS:
            for element in list(node.iter(tag)):
                parent = element.getparent()
                if parent is not None:
                    parent.remove(element)
    except DOM_ERRORS as exc:
        dom_failure("source_page.prune", exc)


def _visible_text(node: Any) -> str:
    """Whitespace-normalized visible text with block boundaries preserved.

    Joined with spaces rather than concatenated: ``text_content()`` fuses
    adjacent blocks into tokens that appear in no dictionary, which then match
    nothing and read as noise.
    """
    try:
        parts = [
            fragment.strip()
            for fragment in node.itertext()
            if fragment and fragment.strip()
        ]
    except DOM_ERRORS as exc:
        dom_failure("source_page.text", exc)
        return ""
    return " ".join(" ".join(parts).split())


def _title(root: Any) -> str:
    try:
        node = next(root.iter("title"), None)
    except DOM_ERRORS as exc:
        dom_failure("source_page.title", exc)
        return ""
    if node is None:
        return ""
    return _visible_text(node)[:SOURCE_PAGE_TITLE_MAX_CHARS]


def _meta_description(root: Any) -> str:
    try:
        for node in root.iter("meta"):
            name = str(node.get("name") or node.get("property") or "").lower()
            if name in {"description", "og:description"}:
                return str(node.get("content") or "").strip()[
                    :SOURCE_PAGE_TITLE_MAX_CHARS
                ]
    except DOM_ERRORS as exc:
        dom_failure("source_page.meta", exc)
    return ""


def _headings(root: Any) -> tuple[str, ...]:
    found: list[str] = []
    try:
        for tag in _HEADING_TAGS:
            for node in root.iter(tag):
                text = _visible_text(node)[:SOURCE_PAGE_TITLE_MAX_CHARS]
                if text:
                    found.append(text)
                if len(found) >= SOURCE_PAGE_MAX_HEADINGS:
                    return tuple(found)
    except DOM_ERRORS as exc:
        dom_failure("source_page.headings", exc)
    return tuple(found)


def _table_headers(root: Any) -> tuple[tuple[str, ...], ...]:
    tables: list[tuple[str, ...]] = []
    try:
        for table in root.iter("table"):
            headers: list[str] = []
            for node in table.iter("th"):
                text = _visible_text(node)[:SOURCE_PAGE_TITLE_MAX_CHARS]
                if text:
                    headers.append(text)
                if len(headers) >= SOURCE_PAGE_MAX_TABLE_HEADERS:
                    break
            tables.append(tuple(headers))
            if len(tables) >= SOURCE_PAGE_MAX_TABLES:
                break
    except DOM_ERRORS as exc:
        dom_failure("source_page.tables", exc)
    return tuple(tables)


def _schema_types(payload: Any, found: list[str], depth: int = 0) -> None:
    """Collect ``@type`` values from arbitrarily shaped JSON-LD.

    Depth-bounded: this walks a structure a third party controls, and real
    schema graphs are shallow. Trusting the interpreter's recursion limit
    instead would turn a hostile document into a lost inspection that still
    spent its budget unit.
    """
    if len(found) >= SOURCE_PAGE_MAX_STRUCTURED_TYPES or depth > _MAX_SCHEMA_DEPTH:
        return
    if isinstance(payload, list):
        for item in payload:
            _schema_types(item, found, depth + 1)
        return
    if not isinstance(payload, dict):
        return
    raw = payload.get("@type")
    for value in raw if isinstance(raw, list) else [raw]:
        if isinstance(value, str) and value and value not in found:
            found.append(value)
    for value in payload.values():
        _schema_types(value, found, depth + 1)


def _structured_types(root: Any) -> tuple[str, ...]:
    found: list[str] = []
    try:
        for node in root.iter("script"):
            if "ld+json" not in str(node.get("type") or "").lower():
                continue
            try:
                _schema_types(json.loads(node.text or ""), found)
            except (ValueError, TypeError, RecursionError):
                # ``json.loads`` itself recurses, so excessive nesting raises
                # before the depth guard above is ever reached. One unreadable
                # block must not cost the rest of the page.
                continue
    except DOM_ERRORS as exc:
        dom_failure("source_page.structured_data", exc)
    return tuple(found[:SOURCE_PAGE_MAX_STRUCTURED_TYPES])


def _outbound_domains(root: Any) -> tuple[str, ...]:
    """Registrable domains this page links out to.

    This is how "the brand is named but not linked" becomes a distinguishable
    finding from "the brand is properly listed".
    """
    seen: list[str] = []
    try:
        for node in root.iter("a"):
            domain = registrable_domain(str(node.get("href") or ""))
            if domain and domain not in seen:
                seen.append(domain)
            if len(seen) >= SOURCE_PAGE_MAX_OUTBOUND_DOMAINS:
                break
    except DOM_ERRORS as exc:
        dom_failure("source_page.links", exc)
    return tuple(seen)


def _content_hash(page: dict[str, Any]) -> str:
    """Hash the PROSE, so a rotated advertisement is not a content change."""
    raw = json.dumps(page, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def extract_source_page(body: bytes, *, charset: str = "") -> ExtractedPage:
    if not body:
        return ExtractedPage()
    parser = lxml_html.HTMLParser(
        recover=True, encoding=_safe_parser_encoding(charset), no_network=True
    )
    try:
        root = lxml_html.document_fromstring(body, parser=parser)
    except (etree.ParserError, ValueError):
        return ExtractedPage()
    if root is None:
        return ExtractedPage()

    title = _title(root)
    meta_description = _meta_description(root)
    headings = _headings(root)
    table_headers = _table_headers(root)
    structured_types = _structured_types(root)
    outbound_domains = _outbound_domains(root)

    # Pruned AFTER the structured-data pass, which lives in script tags.
    body_node = root.find(".//body")
    node = body_node if body_node is not None else root
    _prune_non_prose(node)
    complete_text = _visible_text(node)
    text = complete_text[:SOURCE_PAGE_MAX_TEXT_CHARS]

    return ExtractedPage(
        title=title,
        meta_description=meta_description,
        text=text,
        headings=headings,
        table_headers=table_headers,
        structured_types=structured_types,
        outbound_domains=outbound_domains,
        text_truncated=len(complete_text) > SOURCE_PAGE_MAX_TEXT_CHARS,
        content_hash=_content_hash(
            {
                "title": title,
                "meta": meta_description,
                "table_headers": [list(headers) for headers in table_headers],
                "headings": list(headings),
                "text": text,
                # The publisher's own declaration of what this page IS. It
                # changes the page's format without touching a word of prose,
                # so a hash that ignored it would call that page unchanged.
                # Outbound links are deliberately excluded: navigation and ad
                # slots rotate constantly, which is the noise this hash exists
                # to keep out.
                "structured_types": list(structured_types),
            }
        ),
        parsed=True,
    )
