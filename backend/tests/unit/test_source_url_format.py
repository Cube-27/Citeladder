"""The page kind a URL alone establishes, and what may overwrite it.

Two decisions are covered here and nothing else. First, that a path shape maps
to the kind a reader would agree with -- the failure mode is a greedy pattern
matching inside a longer word, which is how a dated news slug once classified
as a product page. Second, that evidence strength is what decides a write: a
page read without a recognisable kind must not erase what its address already
established, or every blocked re-inspection would downgrade a usable answer.
"""

from __future__ import annotations

import pytest

from app.analysis.source_pages.url_format import derive_url_format
from app.core.config.source_pages import (
    PAGE_FORMAT_ALTERNATIVE,
    PAGE_FORMAT_ARTICLE,
    PAGE_FORMAT_CATEGORY,
    PAGE_FORMAT_COMPARISON,
    PAGE_FORMAT_DISCUSSION,
    PAGE_FORMAT_HOMEPAGE,
    PAGE_FORMAT_HOW_TO,
    PAGE_FORMAT_LISTICLE,
    PAGE_FORMAT_METHOD_HEADING_EVIDENCE,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_STRUCTURED_DATA,
    PAGE_FORMAT_METHOD_URL_PATTERN,
    PAGE_FORMAT_PRODUCT,
    PAGE_FORMAT_UNRESOLVED,
)
from app.domain.source_pages.persistence import _apply_page_format
from app.models.source_pages import SourcePage


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://wise.com/", PAGE_FORMAT_HOMEPAGE),
        ("https://wise.com", PAGE_FORMAT_HOMEPAGE),
        ("https://wise.com/us/blog/revolut-vs-wise", PAGE_FORMAT_COMPARISON),
        # The marker at the START of the path: `/vs/wise` normalizes to
        # `vs-wise`, which has no leading hyphen for a `-vs-` pattern to find.
        ("https://site.com/vs/wise", PAGE_FORMAT_COMPARISON),
        ("https://site.com/wise/vs", PAGE_FORMAT_COMPARISON),
        ("https://site.com/compare", PAGE_FORMAT_COMPARISON),
        ("https://site.com/alternatives/revolut", PAGE_FORMAT_ALTERNATIVE),
        ("https://site.com/how-to-send-money", PAGE_FORMAT_HOW_TO),
        ("https://nerdwallet.com/best-credit-cards", PAGE_FORMAT_LISTICLE),
        ("https://reddit.com/r/fintech/comments/abc/title", PAGE_FORMAT_DISCUSSION),
        ("https://site.com/pricing.html", PAGE_FORMAT_PRODUCT),
        ("https://site.com/category/banking", PAGE_FORMAT_CATEGORY),
        ("https://site.com/2024/05/some-news-item", PAGE_FORMAT_ARTICLE),
        ("https://site.com/xyzzy", PAGE_FORMAT_UNRESOLVED),
    ],
)
def test_a_url_shape_establishes_the_kind_a_reader_would_agree_with(url, expected):
    page_format, _method = derive_url_format(url)
    assert page_format == expected


def test_a_comparison_marker_is_a_whole_segment_and_not_a_substring():
    """`vs` is a segment. `versatile` and `advsomething` are not."""
    assert derive_url_format("https://site.com/versatile-tools")[0] != (
        PAGE_FORMAT_COMPARISON
    )


def test_a_slug_word_does_not_match_inside_a_longer_headline():
    """`-item-` inside a headline is not a product page, and `-p-` is not one.

    The noun patterns are the greedy ones, and a publication date outranks
    them: without that ordering `/2024/05/chip-item-shortage` reads as a
    product page because its slug happens to contain a product word.
    """
    assert derive_url_format("https://site.com/2024/05/chip-item-shortage")[0] == (
        PAGE_FORMAT_ARTICLE
    )
    assert derive_url_format("https://site.com/a-p-q")[0] == PAGE_FORMAT_UNRESOLVED


def test_an_unresolved_verdict_carries_no_derivation_method():
    """Nothing was decided, so nothing may advertise how it was decided."""
    assert derive_url_format("https://site.com/xyzzy") == (
        PAGE_FORMAT_UNRESOLVED,
        PAGE_FORMAT_METHOD_NONE,
    )
    assert derive_url_format("https://wise.com/")[1] == PAGE_FORMAT_METHOD_URL_PATTERN


class _Assessment:
    def __init__(self, page_format: str, method: str) -> None:
        self.page_format = page_format
        self.page_format_method = method


def _page(page_format: str, method: str | None) -> SourcePage:
    page = SourcePage()
    page.page_format = page_format
    page.page_format_method = method
    return page


def test_an_inspection_replaces_a_verdict_read_off_the_address():
    page = _page(PAGE_FORMAT_HOMEPAGE, PAGE_FORMAT_METHOD_URL_PATTERN)
    _apply_page_format(
        page, _Assessment(PAGE_FORMAT_COMPARISON, PAGE_FORMAT_METHOD_STRUCTURED_DATA)
    )
    assert page.page_format == PAGE_FORMAT_COMPARISON
    assert page.page_format_method == PAGE_FORMAT_METHOD_STRUCTURED_DATA


def test_an_inspection_that_recognised_nothing_leaves_the_address_verdict_alone():
    """A blocked or unrecognisable page has learned nothing that contradicts it.

    This is the regression that matters: overwriting here turned a usable
    `comparison` into `unresolved` every time a page was retried and refused.
    """
    page = _page(PAGE_FORMAT_COMPARISON, PAGE_FORMAT_METHOD_URL_PATTERN)
    _apply_page_format(page, None)
    assert page.page_format == PAGE_FORMAT_COMPARISON
    assert page.page_format_method == PAGE_FORMAT_METHOD_URL_PATTERN


def test_a_url_shape_never_overwrites_what_the_page_said_about_itself():
    page = _page(PAGE_FORMAT_ARTICLE, PAGE_FORMAT_METHOD_HEADING_EVIDENCE)
    _apply_page_format(
        page, _Assessment(PAGE_FORMAT_HOMEPAGE, PAGE_FORMAT_METHOD_URL_PATTERN)
    )
    assert page.page_format == PAGE_FORMAT_ARTICLE
    assert page.page_format_method == PAGE_FORMAT_METHOD_HEADING_EVIDENCE


def test_re_reading_a_page_the_same_way_keeps_the_newer_answer():
    """Equal strength is a refresh, not a tie to be resolved in favour of age."""
    page = _page(PAGE_FORMAT_ARTICLE, PAGE_FORMAT_METHOD_HEADING_EVIDENCE)
    _apply_page_format(
        page, _Assessment(PAGE_FORMAT_LISTICLE, PAGE_FORMAT_METHOD_HEADING_EVIDENCE)
    )
    assert page.page_format == PAGE_FORMAT_LISTICLE
