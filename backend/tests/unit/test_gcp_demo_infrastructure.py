from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GCP = ROOT / "infra" / "gcp"
RUNTIME = GCP / "runtime"
WORKFLOWS = ROOT / ".github" / "workflows"


def _read_tree(root: Path, pattern: str) -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(root.glob(pattern))
        if path.is_file() and ".terraform" not in path.parts
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


def test_vm_is_shielded_fixed_size_and_has_no_default_identity() -> None:
    compute = (GCP / "compute.tf").read_text(encoding="utf-8")
    variables = (GCP / "variables.tf").read_text(encoding="utf-8")
    assert 'default = "e2-standard-2"' in variables
    assert 'condition     = var.zone == "asia-south1-a"' in variables
    assert 'for label in split(".", var.domain_name)' in variables
    assert "size  = 30" in compute
    assert 'type  = "pd-balanced"' in compute
    assert 'enable-oslogin         = "TRUE"' in compute
    assert 'block-project-ssh-keys = "TRUE"' in compute
    assert "enable_secure_boot          = true" in compute
    assert "enable_vtpm                 = true" in compute
    assert "enable_integrity_monitoring = true" in compute
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
    workflows = _read_tree(WORKFLOWS, "gcp-demo-*.yml")
    assert "google_secret_manager_secret_version" not in terraform
    assert "random_password" not in terraform
    assert "DEMO_LOGIN_PASSWORD" not in (GCP / "variables.tf").read_text(
        encoding="utf-8"
    )
    assert "--data-file=-" in workflows
    assert "--data-file=$" not in workflows
    assert "GCP_SERVICE_ACCOUNT_KEY" not in workflows


def test_demo_provider_configuration_reaches_its_runtime_owner() -> None:
    workflow = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
    locals_tf = (GCP / "locals.tf").read_text(encoding="utf-8")
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    expected_secret_mappings = {
        "KEENABLE_API_KEY": "citeladder-keenable-api-key",
        "TAVILY_API_KEY": "citeladder-tavily-api-key",
        "CONTENT_API_KEY": "citeladder-content-api-key",
    }
    for variable, secret_id in expected_secret_mappings.items():
        assert f"secrets.{variable}" in workflow
        assert f'"{secret_id}"' in locals_tf
        assert f"add_value_once {secret_id}" in workflow
        assert f"write_env {variable}" in deploy
    assert "secrets.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE" in workflow
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
        assert f"secrets.{variable}" in workflow
        assert f'"{secret_id}"' in locals_tf
        assert f"add_value_once {secret_id}" in workflow
        # Read without a ``|| true`` fallback: a missing secret stops the deploy.
        assert f'secret {secret_id})"' in deploy
        assert f"write_env {runtime_var}" in deploy
    for variable, (secret_id, runtime_var) in optional_oauth_mappings.items():
        assert f"secrets.{variable}" in workflow
        assert f'"{secret_id}"' in locals_tf
        assert f"add_value_once {secret_id}" in workflow
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
        assert f"vars.{variable}" in workflow
        assert f"${{{variable}:?{variable} is required}}" in deploy
        assert f"write_env {variable}" in deploy


def test_public_access_is_the_default_and_demo_mode_stays_switchable() -> None:
    """``DEMO_MODE`` blocks registration and third-party sign-up, so it stays a
    switch that defaults to public rather than a hard-coded value."""
    compose = (RUNTIME / "compose.gcp.yml").read_text(encoding="utf-8")
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    workflow = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
    assert 'DEMO_MODE: "true"' not in compose
    assert "DEMO_MODE: ${DEMO_MODE:-false}" in compose
    assert 'DEMO_MODE="${DEMO_MODE:-false}"' in deploy
    assert '[[ "$DEMO_MODE" =~ ^(true|false)$ ]]' in deploy
    assert "write_env DEMO_MODE" in deploy
    assert "vars.DEMO_MODE || 'false'" in workflow
    assert '--build-arg NEXT_PUBLIC_DEMO_MODE="$DEMO_MODE"' in workflow
    # The bootstrap rejects a database holding anyone but the demo account.
    assert (
        'if [ \\"$$DEMO_MODE\\" = \\"true\\" ]; then python -m app.demo.bootstrap; fi'
        in compose
    )
    assert 'write_env MCP_ALLOWED_ACCOUNT_EMAIL ""' in deploy


def test_deploy_validates_the_latest_commit_as_a_full_diff() -> None:
    workflow = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
    assert "sudo apt-get install --yes --no-install-recommends ripgrep" in workflow
    gate = workflow.split("- name: Run repository gates for the deployed commit", 1)[
        1
    ].split("- uses:", 1)[0]
    assert 'git rev-parse "$env:GITHUB_SHA^"' in gate
    assert "git update-ref refs/remotes/origin/main $deployBase" in gate
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
        text = path.read_text(encoding="utf-8")
        assert "contents: read" in text
        assert "id-token: write" in text
        assert "environment: gcp-demo" in text
        for action in re.findall(r"^\s*- uses: ([^\s]+)$", text, re.MULTILINE):
            if action.startswith("./"):
                continue
            assert re.search(r"@[0-9a-f]{40}$", action), (path.name, action)
    deploy = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
    assert "group: gcp-demo-deploy" in deploy
    assert "cancel-in-progress: false" in deploy
    assert deploy.count("gcloud artifacts docker images describe") >= 2
    assert "if grep -Fxq '0.0.0.0/0'" in deploy
    assert "if grep -Fxq '::/0'" in deploy
    assert "bash /tmp/citeladder-deploy/deploy-vm.sh" in deploy
    destroy = (WORKFLOWS / "gcp-demo-destroy.yml").read_text(encoding="utf-8")
    assert "labels.managed_by" in destroy
    assert "$'citeladder\\tdemo\\tterraform'" in destroy


def test_compose_binds_internal_services_to_loopback_and_runs_all_workers() -> None:
    compose = (RUNTIME / "compose.gcp.yml").read_text(encoding="utf-8")
    assert "network_mode: host" in compose
    assert "listen_addresses=127.0.0.1" in compose
    assert '"--host", "127.0.0.1"' in compose
    assert "HOSTNAME: 127.0.0.1" in compose
    assert "ssl=on" in compose
    assert "DB_SSL_MODE: require" in compose
    assert 'CITELADDER_TASK_LOCAL_BACKEND: "true"' in compose
    assert "NEXT_PUBLIC_DEMO_MODE: ${DEMO_MODE:-false}" in compose
    assert 'AUDIT_WORKER_CONCURRENCY: "2"' in compose
    assert 'DB_POOL_SIZE: "8"' in compose
    assert 'DB_MAX_OVERFLOW: "0"' in compose
    assert 'DEMO_MONITORED_URL_LIMIT: "50000"' in compose
    assert 'SITE_HEALTH_GLOBAL_CONCURRENCY: "8"' in compose
    assert 'SITE_HEALTH_PER_HOST_CONCURRENCY: "6"' in compose
    assert 'SITE_HEALTH_AUTOMATIC_PAGE_LIMIT: "200"' in compose
    assert compose.count("app.workers.") == 10
    assert "TRUSTED_PROXY_CIDRS: ${TRUSTED_PROXY_CIDRS" in compose
    assert 'MCP_ENABLED: "true"' in compose
    assert "MCP_PUBLIC_BASE_URL: https://${DOMAIN_NAME" in compose
    assert "MCP_ALLOWED_ACCOUNT_EMAIL: ${MCP_ALLOWED_ACCOUNT_EMAIL-}" in compose
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
    frontend = compose.split("\n  frontend:", 1)[1].split("\n  audit-worker:", 1)[0]
    assert "env_file:" not in frontend
    assert "JWT_SECRET_KEY" not in frontend
    assert "DEV_LOGIN_PASSWORD" not in frontend
    tls_init = (RUNTIME / "init-postgres-tls.sh").read_text(encoding="utf-8")
    assert "chown 70:70" in tls_init


def test_the_host_never_tears_itself_down() -> None:
    """Teardown is a deliberate act: the destroy workflow, nothing automatic."""
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    compose = (RUNTIME / "compose.gcp.yml").read_text(encoding="utf-8")
    workflow = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
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
    assert "DEMO_EXPIRES_AT:" not in compose


def test_backups_are_fixed_and_operational() -> None:
    deploy = (RUNTIME / "deploy-vm.sh").read_text(encoding="utf-8")
    backup = (RUNTIME / "backup.sh").read_text(encoding="utf-8")
    storage = (GCP / "storage.tf").read_text(encoding="utf-8")
    workflow = (WORKFLOWS / "gcp-demo-deploy.yml").read_text(encoding="utf-8")
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
    assert "gcloud artifacts docker images describe" in workflow
