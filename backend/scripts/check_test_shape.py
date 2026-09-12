"""Reject tests that assert on the text of a file rather than its meaning.

A test that checks for a substring in a source, config, or workflow file breaks
when that file is reformatted and passes when it is semantically broken. It
looks like coverage and defends nothing, which makes it the shape of test that
accumulates fastest and costs a run on every change.

The rule is narrow on purpose. It fires only when an assertion's right-hand
side is a name bound to the text of a file that *has* a parser -- YAML, JSON,
TOML, Python. Terraform, shell, and Caddyfile have no parser here, so a
substring check against those is the honest option and is left alone.
Assertions against an already-parsed structure are never flagged; they are the
prescribed alternative.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "backend" / "tests"

# Readers that yield raw file text. A name bound to one of these is a string,
# so `in` against it is a substring check.
# A single-file read. A whole-tree sweep is deliberately format-agnostic --
# "this string appears nowhere under infra/" is a text question by nature -- so
# helpers that concatenate a tree are not treated as a parseable read.
TEXT_READERS = ("read_text", "read_bytes")

# Formats with a parser available in the backend environment. Reading one of
# these as text and matching substrings is a choice, not a constraint.
PARSEABLE = (".yml", ".yaml", ".json", ".toml", ".py")


def _is_text_read(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in TEXT_READERS
    )


def _extensions(node: ast.expr, inherited: dict[str, frozenset[str]]) -> set[str]:
    """Every file extension this expression could be reading.

    String literals name most of them directly. The rest arrive through a
    module-level constant such as ``_BASELINE = VERSIONS / "0001_initial.py"``,
    so those are resolved first and inherited here by name.
    """
    found: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Constant) and isinstance(child.value, str):
            suffix = Path(child.value).suffix.lower()
            if suffix:
                found.add(suffix)
        elif isinstance(child, ast.Name) and child.id in inherited:
            found |= inherited[child.id]
    return found


def _path_constants(tree: ast.AST) -> dict[str, frozenset[str]]:
    constants: dict[str, frozenset[str]] = {}
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        found = _extensions(node.value, constants)
        if found:
            constants[target.id] = frozenset(found)
    return constants


def _record_text_binding(
    statement: ast.Assign | ast.AnnAssign,
    names: set[str],
    constants: dict[str, frozenset[str]],
) -> None:
    targets = (
        statement.targets if isinstance(statement, ast.Assign) else [statement.target]
    )
    value = statement.value
    is_raw = (
        value is not None
        and _is_text_read(value)
        and bool(_extensions(value, constants).intersection(PARSEABLE))
    )
    for target in targets:
        if isinstance(target, ast.Name):
            names.discard(target.id)
            if is_raw:
                names.add(target.id)


def _assertion_violations(
    assertion: ast.Assert, names: set[str]
) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for node in ast.walk(assertion.test):
        if isinstance(node, ast.Compare):
            for operator, right in zip(node.ops, node.comparators, strict=True):
                if (
                    isinstance(operator, (ast.In, ast.NotIn))
                    and isinstance(right, ast.Name)
                    and right.id in names
                ):
                    found.append(
                        (node.lineno, f"substring assertion against '{right.id}'")
                    )
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = node.func.value
            if (
                node.func.attr == "index"
                and isinstance(owner, ast.Name)
                and owner.id in names
            ):
                found.append((node.lineno, f"text-position assertion on '{owner.id}'"))
    return found


def _violations(path: Path) -> list[tuple[int, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    constants = _path_constants(tree)
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        names: set[str] = set()
        for statement in function.body:
            if isinstance(statement, (ast.Assign, ast.AnnAssign)):
                _record_text_binding(statement, names, constants)
            elif isinstance(statement, ast.Assert):
                found.extend(_assertion_violations(statement, names))
    return found


def main() -> int:
    failures: list[str] = []
    for path in sorted(TESTS.rglob("test_*.py")):
        relative = path.relative_to(ROOT).as_posix()
        for line, reason in _violations(path):
            failures.append(f"{relative}:{line}: {reason}")

    if not failures:
        print("Test shape policy passed.")
        return 0

    print("Tests assert on file text instead of parsed structure:")
    for failure in failures:
        print(f" - {failure}")
    print(
        "\nThe file has a parser. Load it (yaml.safe_load, tomllib.load, "
        "json.loads, ast.parse) and assert on the structure, or move the rule "
        "into scripts/quality.mjs. See 'What earns a test' in AGENTS.md."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
