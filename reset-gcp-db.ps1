[CmdletBinding()]
param()

<#!
.SYNOPSIS
Deploy latest main to the disposable GCP demo and rebuild its database.

.DESCRIPTION
Dispatches the protected GCP deployment with an explicit database reset.
The deployment removes old VM frontend containers, drops and recreates the
citeladder database, applies the current baseline, and starts the backend-only
runtime. No database backup is created by the reset path. Approval of the
gcp-demo GitHub environment is required before the workflow can run.

.EXAMPLE
.\reset-gcp-db.ps1
#>

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name
    )

    $value = $null
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match "^\s*(?:export\s+)?$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()
        }
    }
    if ($null -eq $value) { return $null }
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
$projectId = Get-DotEnvValue -Path $envFile -Name "PROJECT_ID"
if ($projectId -notmatch "^[a-z][a-z0-9-]{4,28}[a-z0-9]$") {
    throw "PROJECT_ID in $envFile is missing or invalid."
}
$git = Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1
$gh = Get-Command gh -CommandType Application -ErrorAction Stop | Select-Object -First 1

Push-Location $repoRoot
try {
    & $git.Source fetch origin main
    if ($LASTEXITCODE -ne 0) { throw "Could not fetch origin/main." }
    $branch = (& $git.Source branch --show-current).Trim()
    $head = (& $git.Source rev-parse HEAD).Trim()
    $originMain = (& $git.Source rev-parse origin/main).Trim()
    if ($branch -ne "main" -or $head -ne $originMain) {
        throw "Run this script from local main synchronized with origin/main."
    }
    $workflowChanges = (& $git.Source status --porcelain --untracked-files=all -- `
        .github/workflows/gcp-demo-deploy.yml infra/gcp/runtime reset-gcp-db.ps1)
    if ($workflowChanges) {
        throw "GCP deployment inputs contain local changes; commit or remove them before resetting."
    }

    Write-Warning "The protected deployment will permanently rebuild the citeladder database in $projectId without a backup."
    & $gh.Source workflow run gcp-demo-deploy.yml --ref main `
        -f reset_database=true -f "confirm_project=$projectId"
    if ($LASTEXITCODE -ne 0) { throw "Could not dispatch the protected GCP reset deployment." }
    Write-Host "Reset deployment dispatched for main $head. Approve gcp-demo, then check the workflow result before using the app."
}
finally {
    Pop-Location
}
