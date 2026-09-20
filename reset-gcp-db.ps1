[CmdletBinding()]
param(
    [string] $Instance = "citeladder-demo"
)

<#!
.SYNOPSIS
Rebuild the disposable CiteLadder GCP database selected by the root .env.

.DESCRIPTION
Runs from the repository root on Windows. PROJECT_ID and ZONE are read from
.env. Running this script immediately and irreversibly drops the fixed
citeladder database, recreates it with the backend image for latest main, runs
migrations, and provisions the configured development login. It creates no
backup. The image is built and pushed when Artifact Registry does not have it
yet.

.EXAMPLE
.\reset-gcp-db.ps1
#>

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Name
    )

    $value = $null
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*(?:export\s+)?$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()
        }
    }
    if ($null -eq $value) {
        return $null
    }
    if ($value.Length -ge 2) {
        $first = $value[0]
        $last = $value[$value.Length - 1]
        if (($first -eq "'" -and $last -eq "'") -or ($first -eq '"' -and $last -eq '"')) {
            return $value.Substring(1, $value.Length - 2)
        }
    }
    return $value
}

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Repository environment file was not found: $envFile"
}

$ProjectId = Get-DotEnvValue -Path $envFile -Name "PROJECT_ID"
$Zone = Get-DotEnvValue -Path $envFile -Name "ZONE"
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    throw "PROJECT_ID is required in $envFile."
}
if ($ProjectId -notmatch "^[a-z][a-z0-9-]{4,28}[a-z0-9]$") {
    throw "PROJECT_ID in $envFile is not a valid GCP project ID."
}
if ([string]::IsNullOrWhiteSpace($Zone)) {
    throw "ZONE is required in $envFile."
}
if ($Zone -notmatch "^[a-z]+-[a-z]+[0-9]-[a-z]$") {
    throw "ZONE in $envFile is not a valid GCP zone."
}
if ($Instance -notmatch "^[a-z][a-z0-9-]{0,61}[a-z0-9]$") {
    throw "Instance is not a valid GCP instance name."
}

$git = Get-Command git -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $git) {
    throw "Git is required to resolve the latest main commit."
}
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $gcloud) {
    throw "Google Cloud CLI is required. Install and authenticate gcloud before retrying."
}
Push-Location $repoRoot
try {
    & $git.Source fetch origin main
    if ($LASTEXITCODE -ne 0) {
        throw "Could not fetch origin/main."
    }
    $branch = (& $git.Source branch --show-current).Trim()
    $sourceCommit = (& $git.Source rev-parse HEAD).Trim()
    $originMain = (& $git.Source rev-parse origin/main).Trim()
    $imageInputChanges = (& $git.Source status --porcelain --untracked-files=all -- `
        .dockerignore Dockerfile backend/app backend/scripts/reconcile_billing.py `
        backend/alembic.ini backend/pyproject.toml backend/uv.lock migrations)
    if ($branch -ne "main" -or $sourceCommit -ne $originMain) {
        throw "Run this script from local main synchronized with origin/main."
    }
    if ($imageInputChanges) {
        throw "Backend image inputs contain local changes; commit or remove them before resetting."
    }
}
finally {
    Pop-Location
}

$region = $Zone -replace "-[a-z]$", ""
$registryHost = "$region-docker.pkg.dev"
$backendRepository = "$registryHost/$ProjectId/citeladder-demo/backend"
$digest = (& gcloud artifacts docker images list $backendRepository `
    --include-tags --filter "tags:$sourceCommit" --format "value(version)" `
    --project $ProjectId --quiet | Select-Object -First 1)
if ($LASTEXITCODE -ne 0) {
    throw "Could not query Artifact Registry for main commit $sourceCommit."
}
if ([string]::IsNullOrWhiteSpace($digest)) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $docker) {
        throw "Docker is required to build the latest main backend image."
    }
    & gcloud auth configure-docker $registryHost --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "Could not configure Docker authentication for $registryHost."
    }
    $taggedImage = "$($backendRepository):$sourceCommit"
    & docker build --build-arg "BUILD_REVISION=$sourceCommit" -t $taggedImage $repoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Could not build the backend image for main commit $sourceCommit."
    }
    & docker push $taggedImage
    if ($LASTEXITCODE -ne 0) {
        throw "Could not push the backend image for main commit $sourceCommit."
    }
    $digest = (& gcloud artifacts docker images list $backendRepository `
        --include-tags --filter "tags:$sourceCommit" --format "value(version)" `
        --project $ProjectId --quiet | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve the pushed backend image for main commit $sourceCommit."
    }
}
$digest = "$digest".Trim()
if ($digest -notmatch "^sha256:[0-9a-f]{64}$") {
    throw "Artifact Registry did not return an immutable backend digest for main commit $sourceCommit."
}
$backendImage = "$backendRepository@$digest"

Write-Warning "Destroying and rebuilding the database on $ProjectId/$Zone/$Instance. No backup will be created."

$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail
phase=preflight
report_failure() {
  local failure=$?
  echo "Database reset failed during $phase at remote script line ${BASH_LINENO[0]} (exit $failure)." >&2
  exit "$failure"
}
trap report_failure ERR
echo 'Remote database reset preflight started.'
expected_project="${1:?Explicit GCP project ID required}"
candidate_source_commit="${2:?Source commit required}"
candidate_backend_image="${3:?Backend image required}"
[[ "$expected_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]
[[ "$candidate_source_commit" =~ ^[0-9a-f]{40}$ ]]
cd /opt/citeladder
set -a
. ./runtime.env
set +a
test "$PROJECT_ID" = "$expected_project"
test "$DEMO_MODE" = false
expected_backend_prefix="${REGION}-docker.pkg.dev/${PROJECT_ID}/citeladder-demo/backend@sha256:"
[[ "$candidate_backend_image" == "$expected_backend_prefix"* ]]
[[ "${candidate_backend_image#"$expected_backend_prefix"}" =~ ^[0-9a-f]{64}$ ]]

# The reset uses the installed Compose layout. An older deployment may have
# runtime.env updated by a failed deploy while its Compose file is still legacy.
# In that case, rebuild the database and restore only the services it defines;
# the normal deploy installs the current frontend afterward.
expected_frontend_prefix="${REGION}-docker.pkg.dev/${PROJECT_ID}/citeladder-demo/frontend@sha256:"
expected_vite_app_prefix="${REGION}-docker.pkg.dev/${PROJECT_ID}/citeladder-demo/vite-app@sha256:"
[[ "$FRONTEND_IMAGE" == "$expected_frontend_prefix"* ]]
[[ "${FRONTEND_IMAGE#"$expected_frontend_prefix"}" =~ ^[0-9a-f]{64}$ ]]

compose=(docker compose --env-file runtime.env -f compose.gcp.yml)
reset_compose=(env BACKEND_IMAGE="$candidate_backend_image" "${compose[@]}")
mapfile -t installed_services < <("${compose[@]}" config --services)
if (( ${#installed_services[@]} == 0 )); then
  echo 'Installed Compose runtime has no services.' >&2
  exit 1
fi
has_vite_app=false
for service in "${installed_services[@]}"; do
  if [[ "$service" == vite-app ]]; then has_vite_app=true; fi
done
if $has_vite_app; then
  if [[ -z "${VITE_APP_IMAGE:-}" ]]; then
    echo 'Installed Compose runtime requires VITE_APP_IMAGE.' >&2
    exit 1
  fi
  [[ "$VITE_APP_IMAGE" == "$expected_vite_app_prefix"* ]]
  [[ "${VITE_APP_IMAGE#"$expected_vite_app_prefix"}" =~ ^[0-9a-f]{64}$ ]]
else
  echo 'Installed Compose runtime has no vite-app service; the current frontend must be installed by GCP Demo - Deploy after this reset.' >&2
fi
db_id="$("${compose[@]}" ps -q db)"
test -n "$db_id"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d citeladder -c \
  'SELECT current_database(), (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM projects) AS projects, (SELECT count(*) FROM billing_subscriptions) AS subscriptions;'
printf 'Installed source commit: %s\n' "$SOURCE_COMMIT"
printf 'Reset source commit: %s\n' "$candidate_source_commit"

docker pull "$candidate_backend_image"
images=("$candidate_backend_image" "$FRONTEND_IMAGE")
if $has_vite_app; then images+=("$VITE_APP_IMAGE"); fi
docker image inspect "${images[@]}" >/dev/null
services=()
for service in "${installed_services[@]}"; do
  case "$service" in db|db-tls-init) ;; *) services+=("$service") ;; esac
done

wait_for_health() {
  for attempt in $(seq 1 60); do
    if curl --fail --silent http://127.0.0.1:3000/health >/dev/null &&
      ( ! $has_vite_app || curl --fail --silent http://127.0.0.1:3001/health >/dev/null ); then
      return 0
    fi
    echo "Application health probe attempt $attempt failed" >&2
    sleep 5
  done
  return 1
}

start_application() {
  "${compose[@]}" up -d --wait --wait-timeout 300
  wait_for_health
}

persist_candidate() {
  grep -q '^BACKEND_IMAGE=' runtime.env
  grep -q '^SOURCE_COMMIT=' runtime.env
  sed -i \
    -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE='$candidate_backend_image'|" \
    -e "s|^SOURCE_COMMIT=.*|SOURCE_COMMIT='$candidate_source_commit'|" \
    runtime.env

  # runtime.env was sourced/exported earlier, and shell environment takes
  # precedence over --env-file in Docker Compose. Keep this process aligned
  # with the values just persisted before starting the application.
  export BACKEND_IMAGE="$candidate_backend_image"
  export SOURCE_COMMIT="$candidate_source_commit"
}

reset_started=false
recover_reset() {
  local failure=$?
  trap - ERR
  echo "Database reset failed during $phase at remote script line ${BASH_LINENO[0]} (exit $failure)." >&2
  echo 'Attempting one bounded recovery with the candidate backend image.' >&2
  if test "$reset_started" = true; then
    if ! "${reset_compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d postgres <<'SQL'
SELECT 'CREATE DATABASE citeladder OWNER citeladder' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'citeladder')
\gexec
SQL
    then
      echo 'Could not restore the database container target; inspect PostgreSQL before retrying.' >&2
      exit "$failure"
    fi
    if
      ! "${reset_compose[@]}" run --rm --no-deps migrate ||
      ! "${reset_compose[@]}" run --rm --no-deps migrate alembic check; then
      echo 'Recovery could not establish a valid schema. Services remain stopped.' >&2
      exit "$failure"
    fi
    persist_candidate
  fi
  if start_application; then
    echo 'Application recovered. The original reset failure is reported by the exit status.' >&2
  else
    echo 'Application recovery failed; inspect Docker Compose status and logs.' >&2
  fi
  exit "$failure"
}

trap recover_reset ERR
phase='stopping application services'
"${compose[@]}" stop "${services[@]}"
reset_started=true
phase='recreating database'
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U citeladder -d postgres \
  -c 'DROP DATABASE citeladder WITH (FORCE);' \
  -c 'CREATE DATABASE citeladder OWNER citeladder;'
phase='applying migrations'
"${reset_compose[@]}" run --rm --no-deps migrate
phase='checking schema'
"${reset_compose[@]}" run --rm --no-deps migrate alembic check
phase='saving candidate revision'
persist_candidate
phase='starting application services'
start_application
trap - ERR
if $has_vite_app; then
  echo 'Database rebuilt from latest main, development login provisioned, application healthy.'
else
  echo 'Database rebuilt from latest main and installed services are healthy. Run GCP Demo - Deploy now to install the current frontend.'
fi
'@

$remoteScriptPath = Join-Path ([IO.Path]::GetTempPath()) (
    "citeladder-reset-db-{0}.sh" -f [guid]::NewGuid().ToString("N")
)
try {
    [IO.File]::WriteAllText(
        $remoteScriptPath,
        $remoteScript.Replace("`r`n", "`n"),
        [Text.UTF8Encoding]::new($false)
    )
    & gcloud compute scp $remoteScriptPath "$($Instance):/tmp/citeladder-reset-db.sh" `
        --project $ProjectId --zone $Zone --tunnel-through-iap --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "Could not upload the GCP database reset operation."
    }
    $remoteCommand = "sudo bash /tmp/citeladder-reset-db.sh $ProjectId $sourceCommit $backendImage"
    & gcloud compute ssh $Instance --project $ProjectId --zone $Zone `
        --tunnel-through-iap --quiet --command $remoteCommand
    if ($LASTEXITCODE -ne 0) {
        throw "GCP database reset command failed with exit code $LASTEXITCODE."
    }
}
finally {
    Remove-Item -LiteralPath $remoteScriptPath -Force -ErrorAction SilentlyContinue
}
