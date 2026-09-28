from lxml import html

from app.analysis.site_health.fact_passages import content_passages


def test_passages_preserve_link_ranges_and_exclude_hidden_chrome():
    root = html.fromstring(
        '<main><h2>Garden care</h2><nav><p>Navigation must not become prose.</p></nav>'
        '<p>Learn about <a href="/soil"><strong>healthy soil</strong></a> '
        'before choosing plants for your garden.</p>'
        '<p hidden>Hidden advice must never become an anchor suggestion.</p></main>'
    )
    result = content_passages(root, set())
    assert len(result["passages"]) == 1
    passage = result["passages"][0]
    linked = passage["linked_ranges"][0]
    assert passage["text"][linked["start"] : linked["end"]] == "healthy soil"
    assert passage["text"][linked["end"] :] == (
        " before choosing plants for your garden."
    )
    assert root.getroottree().xpath(passage["locator"])[0].tag == "p"


def test_long_paragraph_is_omitted_instead_of_offering_clipped_anchor():
    root = html.fromstring(f"<main><p>{'garden ' * 300}</p></main>")
    result = content_passages(root, set())
    assert result["passages"] == []
    assert result["omitted_passages"] == 1
