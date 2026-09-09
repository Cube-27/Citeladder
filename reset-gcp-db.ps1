[CmdletBinding()]
param(
    [ValidatePattern("^[a-z][a-z0-9-]{4,28}[a-z0-9]$")]
    [string] $ProjectId = "project-setup-20260711",

    [string] $Instance = "citeladder-demo",

    [ValidatePattern("^[a-z]+-[a-z]+[0-9]-[a-z]$")]
    [string] $Zone = "asia-south1-b",

    [switch] $Reset,

    [string] $ConfirmProject
)

<#!
.SYNOPSIS
Preview or explicitly rebuild the disposable CiteLadder GCP database.

.DESCRIPTION
Runs from the repository root on Windows. The underlying Linux reset script is
uploaded to the GCP VM through IAP; do not run infra/gcp/runtime/reset-db.sh
directly from PowerShell.

.EXAMPLE
.\reset-gcp-db.ps1

.EXAMPLE
.\reset-gcp-db.ps1 -Reset -ConfirmProject project-setup-20260711
#>

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$runner = Join-Path $repoRoot "infra/gcp/reset-db.py"

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "GCP reset runner was not found: $runner"
}

$python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $python) {
    throw "Python is required. Install Python, then authenticate gcloud before retrying."
}

$arguments = @(
    $runner,
    "--project", $ProjectId,
    "--instance", $Instance,
    "--zone", $Zone
)

if ($Reset) {
    if ($ConfirmProject -ne $ProjectId) {
        throw "Reset is destructive. Repeat the exact project ID with -ConfirmProject $ProjectId."
    }
    $arguments += "--reset-project", $ProjectId
}
elseif ($ConfirmProject) {
    throw "-ConfirmProject is only valid together with -Reset."
}

Push-Location $repoRoot
try {
    & $python.Source @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "GCP database reset command failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
