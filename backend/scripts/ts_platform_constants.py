"""Serialize owned constant vocabularies for the native policy consumer."""

from types import ModuleType


def constants(module: ModuleType, types: tuple[type, ...], *, prefix: str = ""):
    return {
        name.removeprefix(prefix).lower(): sorted(value)
        if isinstance(value, frozenset)
        else value
        for name, value in vars(module).items()
        if name.isupper()
        and not name.startswith("_")
        and name.startswith(prefix)
        and isinstance(value, types)
    }
