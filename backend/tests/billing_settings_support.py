"""Route a test's billing overrides to the settings object that owns them.

Since plan §3.4 split the shared commercial settings from the Razorpay vendor
block, a test that says ``razorpay_mode`` is naming a field on
``razorpay_settings`` (as ``mode``), while ``checkout_enabled`` still belongs
to ``billing_settings``. Tests keep writing the environment-variable spelling
they already used; this helper puts each value where it now lives, so no test
has to know which module a setting migrated to.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import pytest

from app.core.config.billing_settings import billing_settings
from app.core.config.razorpay_settings import razorpay_settings

_RAZORPAY_PREFIX = "razorpay_"


def apply_billing_settings(
    monkeypatch: pytest.MonkeyPatch, values: Mapping[str, Any]
) -> None:
    """Set each override on its owning settings object for one test."""
    for name, value in values.items():
        if name.startswith(_RAZORPAY_PREFIX):
            monkeypatch.setattr(razorpay_settings, name[len(_RAZORPAY_PREFIX) :], value)
        else:
            monkeypatch.setattr(billing_settings, name, value)


__all__ = ["apply_billing_settings"]
