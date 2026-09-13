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
citeladder database, recreates it with the images installed on the VM, runs
migrations, and provisions the configured development login. It creates no
backup.

.EXAMPLE
.\reset-gcp-db.ps1
#>

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
$runner = Join-Path $repoRoot "infra/gcp/reset-db.py"

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

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "GCP reset runner was not found: $runner"
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

$python = Get-Command python -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $python) {
    throw "Python is required. Install Python, then authenticate gcloud before retrying."
}

$arguments = @(
    $runner,
    "--project", $ProjectId,
    "--instance", $Instance,
    "--zone", $Zone,
    "--reset-project", $ProjectId
)

Write-Warning "Destroying and rebuilding the database on $ProjectId/$Zone/$Instance. No backup will be created."

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
