from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
GCP = ROOT / "infra" / "gcp"
RUNTIME = GCP / "runtime"
WORKFLOWS = ROOT / ".github" / "workflows"


def _document(path: Path) -> Any:
    """Parse a YAML file. Structure is the contract; its formatting is not."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _values(node: Any) -> Iterator[str]:
    """Every string value in a parsed document, mapping keys excluded.

    Matching against these rather than the file text means a commented-out
    line, or a key that happens to share a name, can no longer satisfy an
    assertion about what the workflow actually does.
    """
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _values(value)
    elif isinstance(node, list):
        for value in node:
            yield from _values(value)


def _steps(workflow: dict) -> list[dict]:
    return [
        step
        for job in workflow["jobs"].values()
        for step in job.get("steps", [])
        if isinstance(step, dict)
    ]


def _step(workflow: dict, name_fragment: str) -> dict:
    """The one step whose name contains ``name_fragment``."""
    matches = [
        step for step in _steps(workflow) if name_fragment in (step.get("name") or "")
    ]
    assert len(matches) == 1, (name_fragment, [s.get("name") for s in matches])
    return matches[0]


def _shell(workflow: dict) -> str:
    """Every ``run:`` body in a workflow.

    Shell has no parser here, so these assertions stay textual -- but they are
    scoped to the scripts the workflow actually executes.
    """
    return "\n".join(step["run"] for step in _steps(workflow) if "run" in step)


def _read_tree(root: Path, pattern: str) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(root.glob(pattern))
        if path.is_file()
        and ".terraform" not in path.parts
        and "__pycache__" not in path.parts
    )


def test_gcp_network_exposes_only_cloudflare_web_and_iap_ssh() -> None:
    terraform = _read_tree(GCP, "*.tf")
    network = (GCP / "network.tf").read_text(encoding="utf-8")
    assert "auto_create_subnetworks = false" in network
    assert 'source_ranges           = ["35.235.240.0/20"]' in network
    assert 'ports    = ["22"]' in network
    assert 'ports    = ["80", "443"]' in network
    assert "cloudflare_ipv4_cidrs" in network
    assert "cloudflare_ipv6_cidrs" in network
    assert 'ports    = ["3000"]' not in terraform
    assert 'ports    = ["8000"]' not in terraform
    assert 'ports    = ["5432"]' not in terraform
    assert 'source_ranges = ["0.0.0.0/0"]' not in terraform
    assert 'source_ranges = ["::/0"]' not in terraform


def test_vm_is_shielded_fixed_size_and_avoids_incidental_replacement() -> None:
    compute = (GCP / "compute.tf").read_text(encoding="utf-8")
    variables = (GCP / "variables.tf").read_text(encoding="utf-8")
    assert 'default = "e2-standard-2"' in variables
    assert 'default = "asia-south1-a"' in variables
    assert 'regex("^asia-south1-[a-z]$", var.zone)' in variables
    assert 'for label in split(".", var.domain_name)' in variables
    assert "size  = 30" in compute
    assert 'type  = "pd-balanced"' in compute
    assert 'enable-oslogin         = "TRUE"' in compute
    assert 'block-project-ssh-keys = "TRUE"' in compute
    assert "enable_secure_boot          = true" in compute
    assert "enable_vtpm                 = true" in compute
    assert "enable_integrity_monitoring = true" in compute
    assert "ignore_changes = [boot_disk[0].initialize_params[0].image]" in compute
    assert "google_service_account.vm.email" in compute
    instance_only = re.sub(
        r'data "google_compute_image".*?\n}', "", compute, flags=re.S
    )
    assert "default" not in instance_only


def test_wif_is_exact_and_no_service_account_keys_exist() -> None:
    bootstrap = (GCP / "bootstrap.ps1").read_text(encoding="utf-8")
    all_text = _read_tree(GCP, "**/*") + _read_tree(WORKFLOWS, "gcp-demo-*.yml")
    assert "Cube-27/Citeladder" in bootstrap
    assert "assertion.ref=='refs/heads/main'" in bootstrap
    assert "assertion.environment=='$Environment'" in bootstrap
    assert "attribute.repository=assertion.repository" in bootstrap
    assert "$PSNativeCommandUseErrorActionPreference = $true" in bootstrap
    assert 'Write-Output "GCP_ZONE=$Zone"' in bootstrap
    assert "service-account-key" not in all_text.lower()
    assert "credentials_json" not in all_text
    assert "google_service_account_key" not in all_text
    assert "private_key" not in all_text


def test_bootstrap_updates_project_labels_without_alpha_gcloud() -> None:
    bootstrap = (GCP / "bootstrap.ps1").read_text(encoding="utf-8")
    assert "gcloud projects update" not in bootstrap
    assert "gcloud alpha projects update" not in bootstrap
    assert "cloudresourcemanager.googleapis.com/v3/projects/" in bootstrap
    assert "?updateMask=labels" in bootstrap
    assert "foreach ($property in $project.labels.psobject.Properties)" in bootstrap
    assert "-not $operation.done -and $attempt -lt 30" in bootstrap
    assert "$null -ne $operation.error" in bootstrap


def test_bootstrap_uses_supported_billing_iam_flags() -> None:
    bootstrap = (GCP / "bootstrap.ps1").read_text(encoding="utf-8")
    billing_binding = bootstrap.split(
        "gcloud billing accounts add-iam-policy-binding", 1
    )[1].split("if (-not (Test-GcloudResource", 1)[0]
    assert "--role='roles/billing.costsManager'" in billing_binding
    assert "--condition" not in billing_binding


def test_secret_payloads_stay_out_of_terraform_and_arguments() -> None:
    terraform = _read_tree(GCP, "*.tf")
    assert "google_secret_manager_secret_version" not in terraform
    assert "random_password" not in terraform
    assert "DEMO_LOGIN_PASSWORD" not in (GCP / "variables.tf").read_text(
        encoding="utf-8"
    )
    scripts = "\n".join(
        _shell(_document(path)) for path in sorted(WORKFLOWS.glob("gcp-demo-*.yml"))
    )
    assert "--data-file=-" in scripts
    assert "--data-file=$" not in scripts
    assert not any(
        "GCP_SERVICE_ACCOUNT_KEY" in value
        for path in sorted(WORKFLOWS.glob("gcp-demo-*.yml"))
        for value in _values(_document(path))
    )


def test_demo_provider_configuration_reaches_its_runtime_owner() -> None:
    deploy_workflow = _document(WORKFLOWS / "gcp-demo-deploy.yml")
    references = set(_values(deploy_workflow))
    workflow = _shell(deploy_workflow)
    locals_tf = (GCP / "locals.tf").read_text(encoding="utf-8")
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    expected_secret_mappings = {
        "KEENABLE_API_KEY": "citeladder-keenable-api-key",
        "TAVILY_API_KEY": "citeladder-tavily-api-key",
        "CONTENT_API_KEY": "citeladder-content-api-key",
    }
    for variable, secret_id in expected_secret_mappings.items():
        assert any(f"secrets.{variable}" in value for value in references)
        assert f'"{secret_id}"' in locals_tf
        assert f"sync_optional_value {secret_id}" in workflow
        assert f"write_env {variable}" in deploy
    assert any(
        "secrets.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE" in value for value in references
    )
    assert "--build-arg NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE=" in workflow
    assert "citeladder-logo" not in locals_tf
    # An unwired Google pair leaves sign-in and the GSC/GA4 connect buttons
    # 503ing, so the secret -> runtime.env chain is asserted end to end.
    required_oauth_mappings = {
        "GOOGLE_OAUTH_CLIENT_ID": (
            "citeladder-google-oauth-client-id",
            "INTEGRATION_GOOGLE_CLIENT_ID",
        ),
        "GOOGLE_OAUTH_CLIENT_SECRET": (
            "citeladder-google-oauth-client-secret",
            "INTEGRATION_GOOGLE_CLIENT_SECRET",
        ),
    }
    # Bing is optional: absent credentials warn and deploy, leaving only its
    # own connect button 503ing rather than blocking the whole demo.
    optional_oauth_mappings = {
        "BING_OAUTH_CLIENT_ID": (
            "citeladder-bing-oauth-client-id",
            "INTEGRATION_MICROSOFT_CLIENT_ID",
        ),
        "BING_OAUTH_CLIENT_SECRET": (
            "citeladder-bing-oauth-client-secret",
            "INTEGRATION_MICROSOFT_CLIENT_SECRET",
        ),
    }
    for variable, (secret_id, runtime_var) in required_oauth_mappings.items():
        assert any(f"secrets.{variable}" in value for value in references)
        assert f'"{secret_id}"' in locals_tf
        assert f"sync_value {secret_id}" in workflow
        # Read without a ``|| true`` fallback: a missing secret stops the deploy.
        assert f'secret {secret_id})"' in deploy
        assert f"write_env {runtime_var}" in deploy
    for variable, (secret_id, runtime_var) in optional_oauth_mappings.items():
        assert any(f"secrets.{variable}" in value for value in references)
        assert f'"{secret_id}"' in locals_tf
        assert f"sync_optional_value {secret_id}" in workflow
        # Read behind ``|| true``: a missing secret must not stop the deploy.
        assert f'secret {secret_id} 2>/dev/null || true)"' in deploy
        assert f"write_env {runtime_var}" in deploy
    assert 'has_version "$required" ||' in workflow
    assert 'has_version "$optional" ||' in workflow
    assert "/api/v1/auth/oauth/providers" in workflow
    # Content and the default agent are each a provider-neutral trio
    # (key + url + model): neither may silently inherit a baked-in default.
    for variable in (
        "DEFAULT_AGENT_BASE_URL",
        "DEFAULT_AGENT_MODEL",
        "CONTENT_PROVIDER",
        "CONTENT_PROVIDER_ENDPOINT",
        "CONTENT_MODEL",
    ):
        assert any(f"vars.{variable}" in value for value in references)
        assert f"${{{variable}:?{variable} is required}}" in deploy
        assert f"write_env {variable}" in deploy


def test_public_access_is_the_default_and_demo_mode_stays_switchable() -> None:
    """``DEMO_MODE`` blocks registration and third-party sign-up, so it stays a
    switch that defaults to public rather than a hard-coded value."""
    compose = _document(RUNTIME / "compose.gcp.yml")
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    deploy_workflow = _document(WORKFLOWS / "gcp-demo-deploy.yml")
    workflow = _shell(deploy_workflow)
    services = compose["services"]
    assert services["web"]["environment"]["DEMO_MODE"] == "${DEMO_MODE:-false}"
    assert (
        services["frontend"]["environment"]["NEXT_PUBLIC_DEMO_MODE"]
        == "${DEMO_MODE:-false}"
    )
    assert 'DEMO_MODE="${DEMO_MODE:-false}"' in deploy
    assert '[[ "$DEMO_MODE" =~ ^(true|false)$ ]]' in deploy
    assert "write_env DEMO_MODE" in deploy
    assert any("vars.DEMO_MODE || 'false'" in v for v in _values(deploy_workflow))
    assert '--build-arg NEXT_PUBLIC_DEMO_MODE="$DEMO_MODE"' in workflow
    # The bootstrap owns the single demo account or the configured public dev
    # account, depending on the explicit mode.
    assert "alembic upgrade head && python -m app.demo.bootstrap" in " ".join(
        _values(services["migrate"])
    )
    assert 'write_env MCP_ALLOWED_ACCOUNT_EMAIL ""' in deploy


def test_deploy_rotates_configured_secrets_and_verifies_dev_login() -> None:
    workflow = _shell(_document(WORKFLOWS / "gcp-demo-deploy.yml"))
    assert "sync_value()" in workflow
    assert "gcloud secrets versions access latest" in workflow
    assert 'test "${#DEMO_LOGIN_PASSWORD}" -ge 8' in workflow
    assert 'test "${#DEMO_LOGIN_PASSWORD}" -le 128' in workflow
    assert 'sync_value citeladder-demo-password "$DEMO_LOGIN_PASSWORD"' in workflow
    assert (
        'sync_optional_value citeladder-default-agent-api-key "$DEFAULT_AGENT_API_KEY"'
        in workflow
    )
    assert "gcloud secrets versions disable" in workflow
    assert '"https://$DOMAIN_NAME/api/v1/auth/login"' in workflow
    assert "Configured live dev login returned HTTP" in workflow


def test_deploy_validates_the_latest_commit_as_a_full_diff() -> None:
    deploy_workflow = _document(WORKFLOWS / "gcp-demo-deploy.yml")
    workflow = _shell(deploy_workflow)
    assert "sudo apt-get install --yes --no-install-recommends ripgrep" in workflow
    # The step is located by name rather than by splitting the file, so an
    # unrelated edit above it cannot silently empty the slice being asserted.
    gate = _step(deploy_workflow, "Run repository gates for the deployed commit")["run"]
    assert 'git rev-parse "$env:GITHUB_SHA^"' in gate
    assert "git update-ref refs/remotes/origin/main $deployBase" in gate
    assert gate.index("git update-ref") < gate.index("./scripts/check.ps1")
    assert gate.index("./scripts/check.ps1") < gate.index("./scripts/test.ps1")
    assert "./scripts/test.ps1" in gate
    assert "-ChangedFiles" not in gate


def test_images_are_digest_only_and_privileged_actions_are_pinned() -> None:
    variables = (GCP / "variables.tf").read_text(encoding="utf-8")
    assert variables.count("@sha256:[0-9a-f]{64}$") == 2
    assert variables.count("citeladder-demo/backend@sha256:") == 1
    assert variables.count("citeladder-demo/frontend@sha256:") == 1
    assert "immutable_tags = true" in (GCP / "storage.tf").read_text(encoding="utf-8")
    paths = sorted(WORKFLOWS.glob("gcp-demo-*.yml"))
    assert paths
    for path in paths:
        workflow = _document(path)
        # Read from the parsed tree, so a permission granted at job level no
        # longer passes a check written for the workflow level.
        assert workflow["permissions"] == {"contents": "read", "id-token": "write"}
        for job in workflow["jobs"].values():
            assert job["environment"] == "gcp-demo"
        for step in _steps(workflow):
            action = step.get("uses")
            if action is None or action.startswith("./"):
                continue
            assert re.search(r"@[0-9a-f]{40}$", action), (path.name, action)
    deploy_workflow = _document(WORKFLOWS / "gcp-demo-deploy.yml")
    # Declared per job, which the previous substring check could not tell apart
    # from a workflow-level declaration.
    assert [job.get("concurrency") for job in deploy_workflow["jobs"].values()] == [
        {"group": "gcp-demo-deploy", "cancel-in-progress": False}
    ]
    deploy = _shell(deploy_workflow)
    # Both images are resolved to a digest before they are deployed, and a
    # lookup that returns nothing fails the job rather than building an
    # `image@` reference with an empty digest.
    #
    # This asserts the digest RESOLUTION, not the command that performs it:
    # the previous assertion pinned `images describe`, which was replaced by
    # `images list --filter` because `describe` additionally reads Container
    # Analysis occurrences — a separate API the deploy account cannot read.
    # The property being protected survived that change; the string did not.
    assert "image_digest()" in deploy
    assert deploy.count('gcloud artifacts docker images list "$registry/$1"') == 1
    assert '--filter="tags:$GITHUB_SHA"' in deploy
    assert deploy.count("image_digest backend") >= 1
    assert deploy.count("image_digest frontend") >= 1
    assert 'test -n "$backend_digest"' in deploy
    assert 'test -n "$frontend_digest"' in deploy
    assert 'test "$backend_digest" != "$frontend_digest"' in deploy
    assert "if grep -Fxq '0.0.0.0/0'" in deploy
    assert "if grep -Fxq '::/0'" in deploy
    assert "bash /tmp/citeladder-deploy/deploy-vm.sh" in deploy
    destroy = _shell(_document(WORKFLOWS / "gcp-demo-destroy.yml"))
    assert "labels.managed_by" in destroy
    assert "$'citeladder\\tdemo\\tterraform'" in destroy


def test_compose_binds_internal_services_to_loopback_and_runs_all_workers() -> None:
    compose = _document(RUNTIME / "compose.gcp.yml")
    services = compose["services"]
    # Every service shares the host network, so "bound to loopback" is a
    # property of each service's own command and environment rather than of a
    # string appearing somewhere in the file.
    assert {
        name: service.get("network_mode") for name, service in services.items()
    } == {name: "host" for name in services}
    assert services["web"]["command"][:4] == [
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
    ]

    db_command = " ".join(_values(services["db"].get("command", [])))
    assert "listen_addresses=127.0.0.1" in db_command
    assert "ssl=on" in db_command

    web_environment = services["web"]["environment"]
    assert web_environment["DB_SSL_MODE"] == "require"
    assert web_environment["DB_POOL_SIZE"] == "8"
    assert web_environment["DB_MAX_OVERFLOW"] == "0"
    assert web_environment["MCP_ENABLED"] == "true"
    assert web_environment["MCP_PUBLIC_BASE_URL"].startswith("https://${DOMAIN_NAME")
    assert (
        web_environment["MCP_ALLOWED_ACCOUNT_EMAIL"] == "${MCP_ALLOWED_ACCOUNT_EMAIL-}"
    )
    assert web_environment["TRUSTED_PROXY_CIDRS"].startswith("${TRUSTED_PROXY_CIDRS")

    frontend_environment = services["frontend"]["environment"]
    assert frontend_environment["HOSTNAME"] == "127.0.0.1"
    assert frontend_environment["CITELADDER_TASK_LOCAL_BACKEND"] == "true"
    assert frontend_environment["NEXT_PUBLIC_DEMO_MODE"] == "${DEMO_MODE:-false}"

    settings = {
        key: value
        for service in services.values()
        for key, value in (service.get("environment") or {}).items()
    }
    assert settings["AUDIT_WORKER_CONCURRENCY"] == "2"
    assert settings["DEMO_MONITORED_URL_LIMIT"] == "50000"
    assert settings["SITE_HEALTH_GLOBAL_CONCURRENCY"] == "8"
    assert settings["SITE_HEALTH_PER_HOST_CONCURRENCY"] == "6"
    assert settings["SITE_HEALTH_AUTOMATIC_PAGE_LIMIT"] == "200"

    workers = [
        name
        for name, service in services.items()
        if any("app.workers." in value for value in _values(service.get("command", [])))
    ]
    assert len(workers) == 10
    caddy = (RUNTIME / "Caddyfile").read_text(encoding="utf-8")
    assert "trusted_proxies static __CLOUDFLARE_CIDRS__" in caddy
    mcp_matcher = next(
        line for line in caddy.splitlines() if "@mcp_protocol path" in line
    )
    # /register is absent on purpose: it is the frontend's signup page, and
    # proxying it to the backend 405s every GET. MCP's RFC 7591 registration
    # endpoint moved to /mcp/register, which /mcp/* already covers.
    assert mcp_matcher.split()[2:] == [
        "/mcp",
        "/mcp/*",
        "/authorize",
        "/token",
        "/revoke",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource/mcp",
    ]
    assert "reverse_proxy @mcp_protocol 127.0.0.1:8000" in caddy
    # The frontend is a public surface: it gets no env_file and no backend
    # secret. Reading the parsed service means a key added at the end of the
    # block, past where the old text slice stopped, is still caught.
    frontend = services["frontend"]
    assert "env_file" not in frontend
    assert "JWT_SECRET_KEY" not in frontend_environment
    assert "DEV_LOGIN_PASSWORD" not in frontend_environment
    tls_init = (RUNTIME / "init-postgres-tls.sh").read_text(encoding="utf-8")
    assert "chown 70:70" in tls_init


def test_the_host_never_tears_itself_down() -> None:
    """Teardown is a deliberate act: the destroy workflow, nothing automatic."""
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    compose = _document(RUNTIME / "compose.gcp.yml")
    workflow = _shell(_document(WORKFLOWS / "gcp-demo-deploy.yml"))
    terraform = _read_tree(GCP, "*.tf")
    assert not (RUNTIME / "expire.sh").exists()
    assert not (WORKFLOWS / "gcp-demo-expiry.yml").exists()
    assert (WORKFLOWS / "gcp-demo-destroy.yml").exists()
    assert "citeladder-expiry.timer citeladder-backup.timer" not in deploy
    assert "shutdown -h now" not in deploy
    assert "demo-expires-at" not in deploy + terraform
    assert "demo_expires_at" not in terraform
    assert "Demo has expired" not in deploy
    assert "Refusing to change the original demo expiry" not in workflow
    # The retired timers are removed from hosts that already run them.
    assert "citeladder-idle.timer citeladder-expiry.timer" in deploy
    assert "/etc/systemd/system/citeladder-expiry.timer" in deploy
    # Demo mode still honours an expiry when one is configured.
    assert 'write_env DEMO_EXPIRES_AT "$DEMO_EXPIRES_AT"' in deploy
    assert not any(
        "DEMO_EXPIRES_AT" in (service.get("environment") or {})
        for service in compose["services"].values()
    )


def test_backups_are_fixed_and_operational() -> None:
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    backup = (RUNTIME / "backup.sh").read_text(encoding="utf-8")
    storage = (GCP / "storage.tf").read_text(encoding="utf-8")
    assert "./backup.sh predeploy" in deploy
    assert "restoring the previous runtime and services" in deploy
    assert "runtime.env.previous" in deploy
    assert "trap restore_previous_deployment ERR" in deploy
    assert 'running_services="$(docker compose' in deploy
    assert "ps --status running --quiet | grep -q" not in deploy
    assert "printf \"%s='%s'\\n\"" in deploy
    assert "*$'\\n'*|*$'\\r'*|*\"'\"*" in deploy
    assert 'cloudflare_ipv4="$(paste -sd,' in deploy
    assert 'cloudflare_ipv6="$(paste -sd,' in deploy
    assert "urllib.parse.quote" in deploy
    assert 'for service in "${stopped_services[@]}" db' in deploy
    assert "{{.RestartCount}}" in deploy
    assert "{{.State.ExitCode}}" in deploy
    assert "citeladder-backup.timer" in deploy
    assert "pg_dump" in backup
    assert "age = 10" in storage


def test_schema_preflight_precedes_service_shutdown() -> None:
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    check = deploy.index("run --rm --no-deps migrate alembic check")
    stop = deploy.index('stop "${stopped_services[@]}"')
    assert check < stop
    refusal = deploy[check:stop]
    assert "development database rebuild" in refusal
    assert "cp runtime.env.previous runtime.env" in refusal
    assert "trap - ERR" in refusal
    assert "exit 1" in refusal
