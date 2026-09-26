"""Score the live onboarding pipeline against the golden corpus.

This is an opt-in developer tool, never part of CI: it makes real network
requests to customer sites and real model calls.  It scores onboarding research
(business context and competitor suggestions); onboarding generates no prompts.

Usage (from ``backend/``)::

    uv run python -m scripts.run_onboarding_eval --baseline
    uv run python -m scripts.run_onboarding_eval --case feedonomics-united-states

Credentials are read from the repository-root ``.env`` when the process environment
does not already carry them.  Keys are never logged.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import pathlib
import sys
import time
from dataclasses import dataclass, field
from typing import Any

BACKEND = pathlib.Path(__file__).resolve().parent.parent
REPOSITORY = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def _load_env() -> None:
    """Populate the process env from the root .env without overriding it."""
    env_path = REPOSITORY / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


_load_env()

from app.domain.projects.onboarding.industry_library import (  # noqa: E402
    industry_context,
)
from app.domain.projects.onboarding.normalization import (  # noqa: E402
    normalize_website_url,
)
from app.domain.projects.onboarding.research import research_brand  # noqa: E402
from app.domain.projects.onboarding.site_resolution import resolve_site  # noqa: E402
from evaluations.onboarding_cases import GOLDEN_ONBOARDING_CASES  # noqa: E402
from evaluations.onboarding_corpus import GoldenOnboardingCase  # noqa: E402
from evaluations.onboarding_golden import (  # noqa: E402
    evaluate_competitors,
    evaluate_context,
)

# The current product makes the user pick an industry from a fixed list.  To
# give today's pipeline its best possible score we hand it the closest match
# rather than the "General" default a real user would often leave in place.
# Two cases have no honest match at all, which is itself a baseline finding.
BEST_FIT_INDUSTRY: dict[str, tuple[str, str]] = {
    "flipkart-india": ("Ecommerce", "Marketplaces"),
    "best-less-australia": ("Ecommerce", "Fashion Retail"),
    "feedonomics-united-states": ("Software", "Commerce Technology"),
    "canva-australia": ("Software", "Marketing Technology"),
    "puma-india": ("Ecommerce", "Fashion Retail"),
    "urban-company-india": ("General", ""),  # no home-services vertical exists
    "jupiter-india": ("Financial Services", "Banking"),
    "zoho-india": ("Software", "Collaboration"),
    "graza-united-states": ("Ecommerce", "Home and General Merchandise"),
    "wakefit-india": ("Ecommerce", "Home and General Merchandise"),
    "burrow-united-states": ("Ecommerce", "Home and General Merchandise"),
    # A third case the taxonomy cannot express: an implementation agency is not
    # an ecommerce business, and "Software" would restate the very confusion the
    # case exists to catch.
    "valtech-global": ("General", ""),
}

MARKET_CODES = {
    "India": "IN",
    "Australia": "AU",
    "United States": "US",
    "Global": "GLOBAL",
}


@dataclass
class CaseResult:
    slug: str
    brand_name: str
    ok: bool
    detail: str = ""
    industry: str = ""
    subindustry: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)
    elapsed_ms: int = 0


async def _run_case(case) -> CaseResult:
    started = time.perf_counter()
    industry, subindustry = BEST_FIT_INDUSTRY[case.slug]
    result = CaseResult(
        slug=case.slug,
        brand_name=case.brand_name,
        ok=False,
        industry=industry,
        subindustry=subindustry,
    )
    try:
        normalized_url, _domain = normalize_website_url(case.website_url)
        site = await resolve_site(case.website_url, normalized_url)
        selected_industry, _context = industry_context(industry)
        market = MARKET_CODES[case.primary_market]
        research = await research_brand(
            brand_name=case.brand_name,
            primary_market=market,
            industry=selected_industry,
            subindustry=subindustry,
            language_code="en",
            site=site,
        )
        profile = _as_mapping(research.profile)
        competitors = [_competitor_name(entry) for entry in research.competitors]
        competitors = [name for name in competitors if name]
        result.metrics = _score(
            case,
            profile=profile,
            competitors=competitors,
            warnings=list(research.warnings),
        )
        result.ok = True
    except Exception as exc:  # noqa: BLE001 - the harness reports, never aborts
        result.ok = False
        result.detail = f"{type(exc).__name__}: {exc}"
    result.elapsed_ms = int((time.perf_counter() - started) * 1000)
    return result


def _competitor_name(entry: Any) -> str:
    """Competitors arrive as dicts once verified, as models before that."""
    if isinstance(entry, dict):
        return str(entry.get("name") or "").strip()
    return str(getattr(entry, "name", "") or "").strip()


def _as_mapping(value: Any) -> dict[str, Any]:
    """Research results carry either the Pydantic profile or its dumped dict."""
    if isinstance(value, dict):
        return value
    dump = getattr(value, "model_dump", None)
    return dict(dump()) if callable(dump) else {}


def _score(
    case,
    *,
    profile,
    competitors: list[str],
    warnings: list[str],
) -> dict[str, Any]:
    competitor_eval = evaluate_competitors(case, competitors)
    context_eval = evaluate_context(
        case,
        {
            "category": str(profile.get("category") or ""),
            "category_terms": list(profile.get("category_terms") or []),
            "business_model": str(profile.get("business_model") or ""),
            "secondary_business_models": profile.get("secondary_business_models") or [],
            "market_scope": str(profile.get("market_scope") or ""),
            "buyer_type": str(profile.get("business_type") or ""),
        },
    )
    return {
        "resolved_category": str(profile.get("category") or ""),
        "knowledge_strength": str(profile.get("knowledge_strength") or ""),
        "category_match": context_eval.category_match,
        "facet_accuracy": round(context_eval.facet_accuracy, 3),
        "jtbd_coverage": round(context_eval.jtbd_coverage, 3),
        "context_mismatches": list(context_eval.mismatches),
        "competitor_precision": round(competitor_eval.precision, 3),
        "competitor_recall": round(competitor_eval.recall, 3),
        "competitors_found": competitors,
        "competitors_missing": list(competitor_eval.missing),
        "research_warnings": warnings,
    }


def _markdown(results: list[CaseResult]) -> str:
    lines = [
        "# Onboarding research scorecard",
        "",
        "| case | category | facets | jtbd | comp_precision | comp_recall |",
        "|---|---|---|---|---|---|",
    ]
    for result in results:
        if not result.ok:
            lines.append(f"| {result.slug} | FAILED: {result.detail} | | | | |")
            continue
        metrics = result.metrics
        lines.append(
            f"| {result.slug} | "
            f"{'yes' if metrics['category_match'] else 'NO'} | "
            f"{metrics['facet_accuracy']} | {metrics['jtbd_coverage']} | "
            f"{metrics['competitor_precision']} | {metrics['competitor_recall']} |"
        )
    return "\n".join(lines)


def _parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", action="store_true", help="run every case")
    parser.add_argument("--case", action="append", default=[], help="run one slug")
    parser.add_argument("--out", default=None, help="write JSON results here")
    args = parser.parse_args()
    args.selected = _select_cases(parser, args)
    return args


def _select_cases(
    parser: argparse.ArgumentParser, args: argparse.Namespace
) -> list[GoldenOnboardingCase]:
    """Resolve the requested corpus, or exit with the parser's usage message."""
    if args.case:
        selected = [case for case in GOLDEN_ONBOARDING_CASES if case.slug in args.case]
        unknown = set(args.case) - {case.slug for case in selected}
        if unknown:
            parser.error(f"unknown case slug(s): {', '.join(sorted(unknown))}")
        return selected
    if args.baseline:
        return list(GOLDEN_ONBOARDING_CASES)
    # Every case is a live crawl plus several model calls, so the full run is
    # opt-in rather than what you get for forgetting an argument.
    parser.error("pass --baseline for the whole corpus, or --case <slug>")


def _payload(results: list[CaseResult]) -> dict[str, object]:
    return {
        "cases": [
            {
                "slug": r.slug,
                "brand": r.brand_name,
                "ok": r.ok,
                "detail": r.detail,
                "industry": f"{r.industry}/{r.subindustry}".rstrip("/"),
                "elapsed_ms": r.elapsed_ms,
                "metrics": r.metrics,
            }
            for r in results
        ]
    }


def _write_results(raw_destination: str, payload: dict[str, object]) -> None:
    """Write the JSON results, pinned inside the repository.

    ``--out`` is a path from the command line, so it is resolved and checked
    before anything is written. A run that fat-fingers a ``../`` should fail
    loudly, not drop a results file somewhere outside the working tree.

    Synchronous on purpose, and called from a worker thread: blocking file I/O
    on the event loop would stall every in-flight case.
    """
    destination = pathlib.Path(raw_destination).expanduser().resolve()
    if not destination.is_relative_to(REPOSITORY):
        raise SystemExit(f"--out must stay inside {REPOSITORY}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )


async def main() -> int:
    args = _parse_arguments()

    results: list[CaseResult] = []
    for case in args.selected:
        print(f"-> {case.slug} ...", file=sys.stderr, flush=True)
        result = await _run_case(case)
        status = "ok" if result.ok else f"FAILED ({result.detail})"
        print(f"   {status} in {result.elapsed_ms}ms", file=sys.stderr, flush=True)
        results.append(result)

    if args.out:
        await asyncio.to_thread(_write_results, args.out, _payload(results))
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(_markdown(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
