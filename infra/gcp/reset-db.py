"""Preview or explicitly rebuild the disposable GCP database using installed images.

python infra/gcp/reset-db.py --project PROJECT_ID
python infra/gcp/reset-db.py --project PROJECT_ID --reset-project PROJECT_ID

Requires authenticated gcloud/IAP access. Reset destroys all application data and
sessions, then migrates and reprovisions the configured development login. It does
not create backups, change credentials, or select a different image revision.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import subprocess


def commands(args: argparse.Namespace) -> list[list[str]]:
    """Reject ambiguous targets before any remote operation."""
    patterns = {
        "project": r"[a-z][a-z0-9-]{4,28}[a-z0-9]",
        "instance": r"[a-z][a-z0-9-]{0,61}[a-z0-9]",
        "zone": r"[a-z]+-[a-z]+[0-9]-[a-z]",
    }
    for name, pattern in patterns.items():
        if re.fullmatch(pattern, getattr(args, name)) is None:
            raise ValueError(f"Invalid {name}")
    if args.reset_project is not None and args.reset_project != args.project:
        raise ValueError("--reset-project must exactly match --project")
    mode = "reset" if args.reset_project else "preview"
    common = [
        "--project",
        args.project,
        "--zone",
        args.zone,
        "--tunnel-through-iap",
        "--quiet",
    ]
    script = str(Path(__file__).parent / "runtime" / "reset-db.sh")
    return [
        [
            "compute",
            "scp",
            script,
            f"{args.instance}:/tmp/citeladder-reset-db.sh",
            *common,
        ],
        [
            "compute",
            "ssh",
            args.instance,
            *common,
            "--command",
            f"sudo bash /tmp/citeladder-reset-db.sh {args.project} {mode}",
        ],
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--instance", default="citeladder-demo")
    parser.add_argument("--zone", default="asia-south1-a")
    parser.add_argument(
        "--reset-project", help="Destructive opt-in: repeat the exact project ID"
    )
    args = parser.parse_args()
    try:
        operations = commands(args)
    except ValueError as exc:
        parser.error(str(exc))
    executable = shutil.which("gcloud")
    if executable is None:
        parser.error("gcloud is missing; install and authenticate the Google Cloud CLI")
    print(
        f"Target: {args.project}/{args.zone}/{args.instance}; database=citeladder",
        flush=True,
    )
    for operation in operations:
        subprocess.run([executable, *operation], check=True)


if __name__ == "__main__":
    main()
