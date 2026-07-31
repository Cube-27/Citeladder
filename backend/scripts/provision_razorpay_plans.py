"""Razorpay environment guard; v8 plan provisioning lands with the catalog.

The v6 single-plan provisioning flow was deleted with the v6 commercial
layer. The commercial-surface commit reintroduces catalog-driven
provisioning (plan/add-on/top-up provider refs per region). Until then this
module keeps the shared, independently tested ``_validate_environment``
guard and refuses every provisioning operation.
"""

from __future__ import annotations

import argparse
import sys

from app.core.config.billing import billing_settings


def _validate_environment(environment: str) -> None:
    key_id = billing_settings.razorpay_key_id.strip()
    expected_prefix = f"rzp_{environment}_"
    if not key_id.startswith(expected_prefix):
        raise RuntimeError(
            f"configured Razorpay key does not match --environment {environment}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("propose", "verify", "create"))
    parser.add_argument("--environment", required=True, choices=("test", "live"))
    parser.add_argument("--confirm-live", default="")
    args = parser.parse_args()
    del args
    print(
        "plan provisioning is unavailable until the v8 commercial catalog "
        "ships; no v6 plan can be proposed, verified, or created.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
