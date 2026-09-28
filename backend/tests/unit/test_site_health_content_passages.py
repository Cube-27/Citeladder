import pytest
from lxml import html

from app.analysis.site_health.fact_passages import content_passages


@pytest.mark.parametrize("prefix", ["Learn about", "Learn 🌱 about"])
def test_passages_preserve_link_ranges_and_exclude_hidden_chrome(prefix):
    root = html.fromstring(
        "<main><h2>Garden care</h2><nav><p>Navigation must not become prose.</p></nav>"
        f'<p>{prefix} <a href="/soil"><strong>healthy soil</strong></a> '
        "before choosing plants for your garden.</p>"
        "<p hidden>Hidden advice must never become an anchor suggestion.</p></main>"
    )
    result = content_passages(root, set())
    assert len(result["passages"]) == 1
    passage = result["passages"][0]
    linked = passage["linked_ranges"][0]
    utf16 = passage["text"].encode("utf-16-le")
    assert utf16[linked["start"] * 2 : linked["end"] * 2].decode("utf-16-le") == (
        "healthy soil"
    )
    assert utf16[linked["end"] * 2 :].decode("utf-16-le") == (
        " before choosing plants for your garden."
    )
    assert root.getroottree().xpath(passage["locator"])[0].tag == "p"


def test_long_paragraph_is_omitted_instead_of_offering_clipped_anchor():
    root = html.fromstring(f"<main><p>{'garden ' * 300}</p></main>")
    result = content_passages(root, set())
    assert result["passages"] == []
    assert result["omitted_passages"] == 1
