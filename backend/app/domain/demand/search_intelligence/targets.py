"""Canonical saved-target adapters for Search Intelligence."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from urllib.parse import urlsplit

from app.connectors.web_evidence.url_policy import registrable_domain
from app.models.brand import Competitor
from app.models.project import Project


class TargetScopeError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class CanonicalTarget:
    identity: str
    label: str
    registrable_domain: str
    hostname: str
    origin: str
    source_kind: str

    def public_dict(self) -> dict[str, str]:
        return asdict(self)


def _from_url(
    *, identity: str, label: str, value: str, source_kind: str
) -> CanonicalTarget:
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parts = urlsplit(candidate)
    hostname = (parts.hostname or "").strip(".").casefold()
    domain = registrable_domain(hostname)
    if not hostname or not domain:
        raise TargetScopeError("Saved target has no supported canonical hostname")
    if hostname not in {domain, f"www.{domain}"}:
        raise TargetScopeError("Child subdomains are not supported research targets")
    scheme = parts.scheme.casefold()
    if scheme not in {"http", "https"}:
        raise TargetScopeError("Saved target must use HTTP or HTTPS")
    port = f":{parts.port}" if parts.port else ""
    return CanonicalTarget(
        identity, label, domain, hostname, f"{scheme}://{hostname}{port}", source_kind
    )


def owned_targets(project: Project) -> tuple[CanonicalTarget, ...]:
    values: list[tuple[str, str]] = []
    if project.website_url.strip():
        values.append(("primary", project.website_url))
    values.extend((str(row.id), row.domain) for row in project.owned_domains)
    result: dict[str, CanonicalTarget] = {}
    for identity, value in values:
        try:
            target = _from_url(
                identity=identity, label=project.name, value=value, source_kind="owned"
            )
        except TargetScopeError:
            continue
        result.setdefault(target.origin, target)
    return tuple(result.values())


def competitor_target(competitor: Competitor) -> CanonicalTarget:
    domains = [str(value) for value in competitor.domains if str(value).strip()]
    if len(domains) != 1:
        raise TargetScopeError(
            "Competitor must have exactly one saved canonical domain"
        )
    return _from_url(
        identity=str(competitor.id),
        label=competitor.name,
        value=domains[0],
        source_kind="competitor",
    )


def select_owned_target(project: Project, identity: str | None) -> CanonicalTarget:
    targets = owned_targets(project)
    if not targets:
        raise TargetScopeError(
            "Add a canonical main website before running Search Intelligence"
        )
    if identity is None:
        if len(targets) != 1:
            raise TargetScopeError("Select one saved canonical website")
        return targets[0]
    for target in targets:
        if target.identity == identity:
            return target
    raise TargetScopeError("Selected canonical website is not eligible")
