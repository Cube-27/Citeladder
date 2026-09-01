from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TERRAFORM = ROOT / "infra" / "terraform"
WORKFLOWS = ROOT / ".github" / "workflows"


def _terraform_text() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8") for path in TERRAFORM.glob("*.tf")
    )


def test_demo_terraform_preserves_cost_and_network_boundaries() -> None:
    text = _terraform_text()
    assert 'resource "aws_nat_gateway"' not in text
    assert 'resource "aws_elasticache' not in text
    assert 'resource "aws_efs_' not in text
    assert 'resource "aws_ecs_service" "demo"' in text
    assert re.search(r"publicly_accessible\s*=\s*false", text)
    assert re.search(r"multi_az\s*=\s*false", text)
    assert "referenced_security_group_id = aws_security_group.ecs.id" in text
    assert "referenced_security_group_id = aws_security_group.alb.id" in text
    assert "task_role_arn" not in text


def test_demo_terraform_keeps_secret_payloads_out_of_state() -> None:
    text = _terraform_text()
    assert "aws_secretsmanager_secret_version" not in text
    assert "random_password" not in text
    assert "DEV_LOGIN_PASSWORD" not in (TERRAFORM / "variables.tf").read_text(
        encoding="utf-8"
    )
    assert re.search(r"manage_master_user_password\s*=\s*true", text)


def test_demo_images_are_digest_only() -> None:
    variables = (TERRAFORM / "variables.tf").read_text(encoding="utf-8")
    ecs = (TERRAFORM / "ecs.tf").read_text(encoding="utf-8")
    assert variables.count("@sha256:[0-9a-f]{64}$") == 2
    assert re.search(r"image\s*=\s*var\.backend_image", ecs)
    assert re.search(r"image\s*=\s*var\.frontend_image", ecs)


def test_privileged_workflow_actions_are_sha_pinned_and_scoped() -> None:
    paths = sorted(WORKFLOWS.glob("aws-demo-*.yml"))
    assert paths
    for path in paths:
        text = path.read_text(encoding="utf-8")
        assert "contents: read" in text
        assert "id-token: write" in text
        for action in re.findall(r"^\s*- uses: ([^\s]+)$", text, re.MULTILINE):
            if action.startswith("./"):
                continue
            assert re.search(r"@[0-9a-f]{40}$", action), (path.name, action)
        assert "ref:" not in text
        assert "role-to-assume: ${{ inputs." not in text


def test_demo_workflows_do_not_embed_secret_payloads() -> None:
    text = "\n".join(
        path.read_text(encoding="utf-8") for path in WORKFLOWS.glob("aws-demo-*.yml")
    )
    assert "AWS_ACCESS_KEY_ID" not in text
    assert "AWS_SECRET_ACCESS_KEY" not in text
    assert "0.0.0.0/0" not in (TERRAFORM / "terraform.tfvars.example").read_text(
        encoding="utf-8"
    )
