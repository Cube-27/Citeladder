"""What an inspected page is allowed to claim about who appears on it.

The expensive failure here is not a missed match. It is reporting "the brand is
not on this page" about a page nobody managed to read, because that becomes an
outreach task asking a publisher to add something already there.
"""

from __future__ import annotations

import pytest

from app.analysis.source_pages import assess_page, extract_source_page
from app.core.config.source_pages import (
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_DISCUSSION,
    PAGE_FORMAT_LISTICLE,
    PAGE_FORMAT_METHOD_HEADING_EVIDENCE,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_STRUCTURED_DATA,
    PAGE_FORMAT_UNRESOLVED,
    PRESENCE_MATCH_EXACT_ALIAS,
    PRESENCE_NOT_DETECTED,
    PRESENCE_PARTIAL,
    PRESENCE_PRESENT,
    SOURCE_PAGE_MAX_PASSAGES,
    SOURCE_PAGE_PASSAGE_CHARS,
)

_FILLER = "Choosing a customer platform takes careful evaluation. " * 40


def _page(body: str) -> bytes:
    return body.encode("utf-8")


def _listicle(*, names: str, title: str = "Best CRM tools in 2026") -> bytes:
    return _page(
        f"<html><head><title>{title}</title></head>"
        f"<body><h1>{title}</h1><p>{names}</p><p>{_FILLER}</p></body></html>"
    )


def _assess(body: bytes, **kwargs):
    return assess_page(extract_source_page(body), **kwargs)


def test_a_named_brand_is_present_with_a_quotable_passage() -> None:
    result = _assess(
        _listicle(names="Acme Corp leads the field, ahead of Globex."),
        brand_name="Acme Corp",
        competitors=(("Globex", ()),),
    )
    brand = result.presences[0]

    assert brand.presence == PRESENCE_PRESENT
    assert brand.match_method == PRESENCE_MATCH_EXACT_ALIAS
    assert brand.passage_refs
    passage = result.passages[brand.passage_refs[0]]
    assert "Acme Corp" in passage.text
    assert len(passage.text) <= SOURCE_PAGE_PASSAGE_CHARS


def test_an_absent_brand_on_a_well_read_page_is_not_detected() -> None:
    result = _assess(
        _listicle(names="Globex and Initech are the leaders."),
        brand_name="Acme Corp",
        competitors=(("Globex", ()),),
    )
    brand, competitor = result.presences

    assert brand.presence == PRESENCE_NOT_DETECTED
    assert brand.passage_refs == ()
    assert competitor.presence == PRESENCE_PRESENT
    assert result.sufficient_coverage is True


def test_a_page_that_yielded_almost_nothing_reports_partial_not_absent() -> None:
    """An unread page must never become a reported absence."""
    result = _assess(
        _page("<html><body><p>Loading.</p></body></html>"),
        brand_name="Acme Corp",
    )

    assert result.presences[0].presence == PRESENCE_PARTIAL
    assert result.sufficient_coverage is False


def test_unparseable_content_is_partial_rather_than_absent() -> None:
    result = _assess(b"\x00\x01\x02", brand_name="Acme Corp")

    assert result.presences[0].presence == PRESENCE_PARTIAL
    assert result.page_format == PAGE_FORMAT_UNRESOLVED
    assert result.page_format_method == PAGE_FORMAT_METHOD_NONE


def test_a_brand_name_inside_a_longer_word_is_not_a_match() -> None:
    result = _assess(
        _listicle(names="Their approach is acmeish and unrelated."),
        brand_name="Acme",
    )

    assert result.presences[0].presence == PRESENCE_NOT_DETECTED


def test_script_and_style_content_never_becomes_page_prose() -> None:
    """Otherwise a tracking payload reads as something the publisher wrote."""
    body = _page(
        "<html><head><title>Guide</title>"
        "<style>.acme-corp { color: red }</style></head>"
        "<body><script>var vendor = 'Acme Corp';</script>"
        f"<p>{_FILLER}</p></body></html>"
    )

    result = _assess(body, brand_name="Acme Corp")

    assert result.presences[0].presence == PRESENCE_NOT_DETECTED


def test_evidence_is_bounded_however_often_a_name_appears() -> None:
    result = _assess(
        _listicle(names="Acme Corp. " * 200),
        brand_name="Acme Corp",
    )

    assert len(result.passages) <= SOURCE_PAGE_MAX_PASSAGES
    assert result.presences[0].match_count > SOURCE_PAGE_MAX_PASSAGES


def test_the_brand_keeps_its_evidence_on_a_page_full_of_competitors() -> None:
    """The brand's own presence is the finding the workflow turns on."""
    competitors = tuple((f"Rival{index}", ()) for index in range(12))
    names = "Acme Corp competes with " + ", ".join(name for name, _ in competitors)

    result = _assess(
        _listicle(names=names), brand_name="Acme Corp", competitors=competitors
    )
    brand = result.presences[0]

    assert brand.presence == PRESENCE_PRESENT
    assert brand.passage_refs
    assert "Acme Corp" in result.passages[brand.passage_refs[0]].text


def test_outbound_links_distinguish_a_mention_from_a_listing() -> None:
    body = _page(
        "<html><head><title>Best CRM tools</title></head><body>"
        "<p>Acme Corp is worth a look.</p>"
        '<a href="https://globex.com/pricing">Globex</a>'
        f"<p>{_FILLER}</p></body></html>"
    )

    page = extract_source_page(body)

    # Exact registrable domains, not substrings: a brand named in prose but
    # never linked is a different finding from one that is properly listed.
    assert set(page.outbound_domains) == {"globex.com"}


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Acme vs Globex: which CRM wins", PAGE_FORMAT_COMPARISON),
        ("Best CRM tools in 2026", PAGE_FORMAT_LISTICLE),
        ("Top 10 CRM platforms", PAGE_FORMAT_LISTICLE),
        ("Globex alternatives for small teams", PAGE_FORMAT_COMPARISON),
    ],
)
def test_page_format_is_read_from_the_page_itself(title: str, expected: str) -> None:
    result = _assess(_listicle(names="Acme Corp.", title=title), brand_name="Acme Corp")

    assert result.page_format == expected
    assert result.page_format_method == PAGE_FORMAT_METHOD_HEADING_EVIDENCE


def test_a_publishers_own_declaration_outranks_its_headline() -> None:
    """A forum thread titled like a listicle is still a forum thread."""
    body = _page(
        "<html><head><title>Best CRM tools in 2026</title>"
        '<script type="application/ld+json">'
        '{"@type": "DiscussionForumPosting"}</script></head>'
        f"<body><p>{_FILLER}</p></body></html>"
    )

    result = _assess(body, brand_name="Acme Corp")

    assert result.page_format == PAGE_FORMAT_DISCUSSION
    assert result.page_format_method == PAGE_FORMAT_METHOD_STRUCTURED_DATA


def test_an_unrecognisable_page_stays_unresolved_rather_than_guessed() -> None:
    body = _page(
        f"<html><head><title>Notes</title></head><body>{_FILLER}</body></html>"
    )

    result = _assess(body, brand_name="Acme Corp")

    assert result.page_format == PAGE_FORMAT_UNRESOLVED


def test_prose_changes_the_content_hash_and_markup_noise_does_not() -> None:
    """Otherwise every rotated advertisement looks like a content change."""
    base = "<html><head><title>Guide</title></head><body><p>Acme Corp leads.</p>"
    first = extract_source_page(_page(base + '<div id="ad-1"></div></body></html>'))
    same_prose = extract_source_page(
        _page(base + '<div id="ad-2"><script>var x=1</script></div></body></html>')
    )
    new_prose = extract_source_page(
        _page(
            "<html><head><title>Guide</title></head>"
            "<body><p>Globex leads.</p></body></html>"
        )
    )

    assert first.content_hash == same_prose.content_hash
    assert first.content_hash != new_prose.content_hash


def test_page_facts_never_carry_the_extracted_text() -> None:
    """The text is a working copy; retaining it would republish the page."""
    page = extract_source_page(_listicle(names="Acme Corp leads."))

    facts = page.as_page_facts()

    assert "text" not in facts
    assert page.extracted_chars > 0
    assert _FILLER.strip() not in str(facts)


def test_a_declared_page_type_change_is_a_content_change() -> None:
    """Format comes from the declaration, so the hash has to cover it."""
    prose = "<body><p>Acme Corp leads.</p></body>"
    before = extract_source_page(_page(f"<html><head><title>T</title></head>{prose}"))
    after = extract_source_page(
        _page(
            "<html><head><title>T</title>"
            '<script type="application/ld+json">{"@type": "ItemList"}</script>'
            f"</head>{prose}</html>"
        )
    )

    assert before.content_hash != after.content_hash


def test_a_rotating_link_set_is_not_a_content_change() -> None:
    """Navigation and ad slots churn constantly; that is the excluded noise."""
    head = "<html><head><title>T</title></head><body><p>Acme Corp leads.</p>"
    label = "Sponsored"
    first = extract_source_page(
        _page(head + f'<a href="https://a.com/x">{label}</a></body>')
    )
    second = extract_source_page(
        _page(head + f'<a href="https://b.com/y">{label}</a></body>')
    )

    assert first.outbound_domains != second.outbound_domains
    assert first.content_hash == second.content_hash


def test_hostile_json_ld_nesting_costs_only_its_own_block() -> None:
    """A page that blows the parser must not lose the whole inspection."""
    bomb = "[" * 20000 + "]" * 20000
    body = _page(
        "<html><head><title>Best CRM tools</title>"
        f'<script type="application/ld+json">{bomb}</script>'
        '<script type="application/ld+json">{"@type": "ItemList"}</script>'
        f"</head><body><p>Acme Corp leads.</p><p>{_FILLER}</p></body></html>"
    )

    page = extract_source_page(body)

    assert page.parsed is True
    assert page.extracted_chars > 0
    assert "ItemList" in page.structured_types


def test_a_nested_publisher_does_not_make_an_article_a_directory() -> None:
    """A normal article graph nests its publisher as an Organization."""
    body = _page(
        "<html><head><title>Notes</title>"
        '<script type="application/ld+json">'
        '{"@type": "NewsArticle", "publisher": {"@type": "Organization"}}'
        "</script></head>"
        f"<body><p>{_FILLER}</p></body></html>"
    )

    result = _assess(body, brand_name="Acme Corp")

    assert result.page_format == PAGE_FORMAT_ARTICLE
    assert result.page_format_method == PAGE_FORMAT_METHOD_STRUCTURED_DATA


def test_a_url_shaped_schema_type_is_still_recognised() -> None:
    """``@type`` is frequently written as a schema.org URL."""
    body = _page(
        "<html><head><title>Notes</title>"
        '<script type="application/ld+json">'
        '{"@type": "https://schema.org/ItemList"}</script></head>'
        f"<body><p>{_FILLER}</p></body></html>"
    )

    assert _assess(body, brand_name="Acme Corp").page_format == PAGE_FORMAT_LISTICLE


def test_a_two_letter_alias_never_produces_ambiguous_presence() -> None:
    """On a page of prose a short alias matches an ordinary word."""
    result = _assess(
        _listicle(names="Teams use AI tools to evaluate vendors."),
        brand_name="Acme Corp",
        competitors=(("AI", ("AI",)),),
    )

    assert result.presences[1].presence == PRESENCE_NOT_DETECTED
