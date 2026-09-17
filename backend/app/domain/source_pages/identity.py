"""Deciding what page a citation points at.

One citation URL can be three different things: a publisher URL, a redirect
token standing in for one, or something the URL policy refuses. This owner
names which, and produces the stable ``url_hash`` that a ``SourcePage`` is
keyed by.

The resolution is deliberately offline. Analysis runs inside the audit scoring
path, and making a citation write depend on a third party being reachable would
put the evidence at the mercy of someone else's uptime. A redirect is therefore
recorded as ``unresolved`` here and resolved later by the inspector, which is
already making network calls and is allowed to fail.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.connectors.answer_engines.grounding_redirect import is_grounding_redirect
from app.connectors.web_evidence.url_policy import UrlPolicyError, registrable_domain
from app.core.config.source_pages import (
    SOURCE_PAGE_IDENTITY_VERSION,
    URL_IDENTITY_UNRESOLVED,
    URL_IDENTITY_UNWRAPPED_REDIRECT,
    URL_IDENTITY_VERBATIM,
)
from app.domain.site_health.normalization import canonical_identity


@dataclass(frozen=True, slots=True)
class CitationIdentity:
    """What a citation URL resolves to, and how that was established.

    ``url_hash`` is ``None`` for anything unresolved. That is a real state, not
    a placeholder: counting each unresolved redirect token as a distinct page
    is how one publisher comes to look like many, and how a genuinely recurrent
    source never looks recurrent.
    """

    method: str
    canonical_url: str | None
    url_hash: str | None
    registrable_domain: str | None
    resolved_url: str | None = None
    version: str = SOURCE_PAGE_IDENTITY_VERSION

    @property
    def is_resolved(self) -> bool:
        return self.url_hash is not None


def _unresolved() -> CitationIdentity:
    return CitationIdentity(
        method=URL_IDENTITY_UNRESOLVED,
        canonical_url=None,
        url_hash=None,
        registrable_domain=None,
    )


def _resolved(url: str, *, method: str, resolved_url: str | None) -> CitationIdentity:
    try:
        canonical, digest = canonical_identity(url)
        domain = registrable_domain(canonical)
    except (UrlPolicyError, TypeError, ValueError):
        # A URL the policy refuses is unresolved, not an error to raise: one
        # malformed citation must never fail the analysis of a whole answer.
        return _unresolved()
    return CitationIdentity(
        method=method,
        canonical_url=canonical,
        url_hash=digest,
        registrable_domain=domain,
        resolved_url=resolved_url,
    )


def identify_citation_url(url: str | None) -> CitationIdentity:
    """Resolve a citation URL offline, without following anything."""
    raw = str(url or "").strip()
    if not raw:
        return _unresolved()
    if is_grounding_redirect(raw):
        return _unresolved()
    return _resolved(raw, method=URL_IDENTITY_VERBATIM, resolved_url=None)


def identify_unwrapped_redirect(final_url: str | None) -> CitationIdentity:
    """Resolve a redirect token once the inspector has followed it.

    ``final_url`` is the URL the fetch actually landed on, after every hop was
    re-validated. A redirect that lands on another redirect is still
    unresolved.
    """
    raw = str(final_url or "").strip()
    if not raw or is_grounding_redirect(raw):
        return _unresolved()
    return _resolved(raw, method=URL_IDENTITY_UNWRAPPED_REDIRECT, resolved_url=raw)
