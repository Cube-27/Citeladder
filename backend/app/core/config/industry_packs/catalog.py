"""Exact, immutable loader for the canonical industry-pack catalog.

This module performs file I/O only while loading catalog definitions. Callers must
freeze the returned manifest with the crawl/snapshot that uses it. The reference
classifier accepts an already loaded pack and performs no I/O itself.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

CATALOG_ROOT = Path(__file__).resolve().parent
REGISTRY_PATH = CATALOG_ROOT / "registry.json"
TAXONOMY_PATH = CATALOG_ROOT / "taxonomy.json"


class CatalogError(ValueError):
    """The catalog cannot safely resolve or load the requested definition."""


def canonical_json_bytes(value: Any) -> bytes:
    """Return the byte representation used by registry content hashes."""

    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def canonical_content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CatalogError(f"catalog file is missing: {path.name}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"catalog file is invalid: {path.name}: {exc}") from exc


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _normalized_lookup_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


@lru_cache(maxsize=1)
def registry() -> Mapping[str, Any]:
    data = _read_json(REGISTRY_PATH)
    if not isinstance(data, dict) or not isinstance(data.get("packs"), list):
        raise CatalogError("registry.json has no pack registry")
    return _freeze(data)


@lru_cache(maxsize=1)
def taxonomy() -> Mapping[str, Any]:
    data = _read_json(TAXONOMY_PATH)
    if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
        raise CatalogError("taxonomy.json has no taxonomy nodes")
    return _freeze(data)


def registered_pack_refs() -> tuple[tuple[str, str], ...]:
    refs = []
    for entry in registry()["packs"]:
        refs.append((str(entry["pack_id"]), str(entry["version"])))
    return tuple(refs)


def _registry_entry(pack_id: str, version: str) -> Mapping[str, Any]:
    matches = [
        entry
        for entry in registry()["packs"]
        if entry["pack_id"] == pack_id and entry["version"] == version
    ]
    if len(matches) != 1:
        raise CatalogError(f"unknown exact industry pack: {pack_id}@{version}")
    return matches[0]


def _safe_catalog_path(relative_path: str) -> Path:
    candidate = (CATALOG_ROOT / relative_path).resolve()
    try:
        candidate.relative_to(CATALOG_ROOT.resolve())
    except ValueError as exc:
        raise CatalogError(f"pack path escapes catalog root: {relative_path}") from exc
    return candidate


@lru_cache(maxsize=64)
def load_pack(pack_id: str, version: str) -> Mapping[str, Any]:
    """Load one exact ID/version and verify identity plus canonical content hash."""

    entry = _registry_entry(pack_id, version)
    relative_path = str(entry["file"])
    data = _read_json(_safe_catalog_path(relative_path))
    if not isinstance(data, dict):
        raise CatalogError(f"pack is not a JSON object: {pack_id}@{version}")
    if data.get("pack_id") != pack_id or data.get("version") != version:
        raise CatalogError(f"pack identity mismatch: {pack_id}@{version}")
    observed_hash = canonical_content_hash(data)
    expected_hash = str(entry["content_hash"])
    if observed_hash != expected_hash:
        raise CatalogError(
            f"pack content hash mismatch: {pack_id}@{version}: "
            f"expected {expected_hash}, observed {observed_hash}"
        )
    return _freeze(data)


def resolve_pack_id(
    identifier: str,
    *,
    allow_general_fallback: bool = False,
) -> str:
    """Resolve a pack ID, label, alias, or subindustry without cross-pack guessing."""

    if not isinstance(identifier, str) or not identifier.strip():
        raise CatalogError("industry identifier must be a non-empty string")
    needle = _normalized_lookup_key(identifier)
    entries = tuple(registry()["packs"])

    exact = [entry for entry in entries if entry["pack_id"] == needle]
    if len(exact) == 1:
        return str(exact[0]["pack_id"])

    matches: set[str] = set()
    for entry in entries:
        values = [entry["pack_id"], entry["label"], *entry.get("aliases", ())]
        if any(_normalized_lookup_key(str(value)) == needle for value in values):
            matches.add(str(entry["pack_id"]))

    for node in taxonomy()["nodes"]:
        values = [node["taxonomy_id"], node["label"]]
        subindustry = node.get("subindustry")
        if subindustry:
            values.append(subindustry)
        if any(_normalized_lookup_key(str(value)) == needle for value in values):
            matches.add(str(node["primary_pack_id"]))

    if len(matches) == 1:
        return next(iter(matches))
    if len(matches) > 1:
        options = ", ".join(sorted(matches))
        raise CatalogError(f"ambiguous industry identifier {identifier!r}: {options}")
    if allow_general_fallback:
        return str(registry()["general_fallback_pack_id"])
    raise CatalogError(f"unknown industry identifier: {identifier!r}")


def load_resolved_pack(
    identifier: str,
    *,
    version: str | None = None,
    allow_general_fallback: bool = False,
) -> Mapping[str, Any]:
    """Resolve an identifier, then perform an exact immutable load.

    Omitting ``version`` selects the single version explicitly registered for the
    resolved pack. It does not inspect filenames or choose a latest version.
    """

    pack_id = resolve_pack_id(
        identifier,
        allow_general_fallback=allow_general_fallback,
    )
    entries = [entry for entry in registry()["packs"] if entry["pack_id"] == pack_id]
    if len(entries) != 1:
        message = f"registry must contain exactly one active {pack_id} version"
        raise CatalogError(message)
    registered_version = str(entries[0]["version"])
    selected_version = version or registered_version
    return load_pack(pack_id, selected_version)


def pack_manifest(pack_id: str, version: str) -> Mapping[str, str]:
    """Return the immutable manifest that runtime wiring must persist per crawl."""

    entry = _registry_entry(pack_id, version)
    pack = load_pack(pack_id, version)
    policy = pack["classification_policy"]
    manifest = {
        "catalog_version": str(registry()["catalog_version"]),
        "pack_id": pack_id,
        "pack_version": version,
        "pack_content_hash": str(entry["content_hash"]),
        "classifier_version": str(policy["classifier_version"]),
    }
    return MappingProxyType(manifest)
