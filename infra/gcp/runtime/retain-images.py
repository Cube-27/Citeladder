#!/usr/bin/env python3
"""Retain deployment/rollback/container images; preview unless --apply is given."""

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path


def docker(*arguments, environment=None):
    return subprocess.check_output(
        ["docker", *arguments], text=True, env=environment, stderr=subprocess.PIPE
    ).strip()


def deployment_images(directory):
    references = set()
    for suffix in ("", ".previous"):
        env_file = directory / f"runtime.env{suffix}"
        compose_file = directory / f"compose.gcp.yml{suffix}"
        if suffix and not env_file.exists() and not compose_file.exists():
            continue
        if not env_file.is_file() or not compose_file.is_file():
            raise RuntimeError(
                f"Incomplete deployment configuration: {suffix or 'current'}"
            )
        # The deploy process exports candidate values. Those must not override
        # the rollback env file when resolving its immutable image references.
        keys = {line.split("=", 1)[0] for line in env_file.read_text().splitlines()}
        environment = {
            key: value for key, value in os.environ.items() if key not in keys
        }
        images = docker(
            "compose",
            "--env-file",
            str(env_file),
            "-f",
            str(compose_file),
            "config",
            "--images",
            environment=environment,
        ).splitlines()
        if not images:
            raise RuntimeError("Deployment configuration contains no images")
        references.update(images)
    return references


def removable_images(images, protected_references, used_ids, registry):
    repositories = {
        f"{registry}/{name}"
        for name in (
            "backend",
            "api-service",
            "frontend",
            "vite-app",
        )
    }
    selected = []
    for image in images:
        references = set(image.get("RepoTags") or []) | set(
            image.get("RepoDigests") or []
        )
        if image["Id"] in used_ids or references & protected_references:
            continue
        # Never touch unowned images or unidentifiable dangling layers. An image
        # with another repository's tag is also outside this deployment's scope.
        if references and all(
            reference.split("@", 1)[0].rsplit(":", 1)[0] in repositories
            for reference in references
        ):
            selected.append(image)
    return selected


def retain(directory, registry, apply):
    protected = deployment_images(directory)
    image_ids = docker("image", "ls", "--quiet", "--no-trunc").splitlines()
    images = (
        json.loads(docker("image", "inspect", *sorted(set(image_ids))))
        if image_ids
        else []
    )
    container_ids = docker("ps", "--all", "--quiet").splitlines()
    containers = json.loads(docker("inspect", *container_ids)) if container_ids else []
    candidates = removable_images(
        images, protected, {item["Image"] for item in containers}, registry
    )
    for image in candidates:
        print(f"{'Removing' if apply else 'Would remove'} {image['Id']}", flush=True)
        if apply:
            # No --force: Docker refuses deletion if a container starts using
            # the image after inventory. Never remove containers or volumes.
            references = sorted(
                set(image.get("RepoTags") or []) | set(image.get("RepoDigests") or [])
            )
            docker("image", "rm", *references)
    return len(candidates)


def require_space(minimum):
    root = docker("info", "--format", "{{.DockerRootDir}}")
    free = shutil.disk_usage(root).free
    if free < minimum:
        raise RuntimeError(
            f"Docker disk has {free} bytes free; deployment requires {minimum}"
        )
    print(f"Docker disk headroom: {free} bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path("/opt/citeladder"))
    parser.add_argument("--registry", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--min-free-bytes", type=int, default=0)
    args = parser.parse_args()
    retain(args.directory.resolve(), args.registry, args.apply)
    if args.min_free_bytes:
        require_space(args.min_free_bytes)


if __name__ == "__main__":
    main()
