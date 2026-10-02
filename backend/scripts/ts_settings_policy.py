"""Serialize Settings contracts without exporting configured or default credentials."""

import types
import typing
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import SecretStr
from pydantic.fields import FieldInfo
from pydantic_settings import BaseSettings

from app.core.config import Settings


def _env_names(name: str, field: FieldInfo, prefix: str) -> list[str]:
    alias = field.validation_alias
    choices = [alias] if isinstance(alias, str) else getattr(alias, "choices", None)
    choices = choices or [f"{prefix}{name}"]
    return list(dict.fromkeys(str(choice).upper() for choice in choices))


def _type_descriptor(annotation: Any) -> dict[str, Any]:
    if annotation == Decimal | None:
        return {"type": "decimal", "nullable": True}
    if typing.get_origin(annotation) is typing.Literal:
        return {"type": "literal", "values": list(typing.get_args(annotation))}
    if isinstance(annotation, types.UnionType) and set(annotation.__args__) == {
        datetime,
        type(None),
    }:
        return {"type": "datetime", "nullable": True}
    for candidate, label in (
        (bool, "bool"),
        (int, "int"),
        (float, "float"),
        (str, "str"),
        (SecretStr, "str"),
    ):
        if annotation is candidate:
            return {"type": label}
    raise TypeError(f"Unsupported exported setting type: {annotation!r}")


def _export_default(name: str, field: FieldInfo) -> Any:
    default = field.get_default(call_default_factory=True)
    metadata = field.json_schema_extra
    sensitive = isinstance(metadata, dict) and metadata.get("secret") is True
    if isinstance(default, SecretStr) or sensitive:
        value = (
            default.get_secret_value() if isinstance(default, SecretStr) else default
        )
        if value:
            raise ValueError(f"{name} has a non-empty secret default")
        return ""
    return default


def setting(name: str, model: type[BaseSettings] = Settings) -> dict[str, Any]:
    field = model.model_fields[name]
    prefix = str(model.model_config.get("env_prefix") or "")
    entry: dict[str, Any] = {"env": _env_names(name, field, prefix)}
    entry.update(_type_descriptor(field.annotation))
    entry["default"] = _export_default(name, field)
    for constraint in field.metadata:
        if (minimum := getattr(constraint, "ge", None)) is not None:
            entry["minimum"] = minimum
        if (exclusive := getattr(constraint, "gt", None)) is not None:
            entry["exclusive_minimum"] = exclusive
        if (maximum := getattr(constraint, "le", None)) is not None:
            entry["maximum"] = maximum
        if (exclusive := getattr(constraint, "lt", None)) is not None:
            entry["exclusive_maximum"] = exclusive
    return entry
