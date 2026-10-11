<#
.SYNOPSIS
  Runs API tests against the one local development database.

.DESCRIPTION
  Pre-launch there are no customers, so the API suite uses the local
  `citeladder` database from docker compose instead of per-branch copies that
  nobody drops. The URL is built from POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB
  in .env (the .env DATABASE_URL host is the compose network, not this
  machine); nothing secret is printed. Live provider credentials inherited from
  the shell are cleared before any test runs.

  Output goes to one reusable log in this worktree's Git directory.

.EXAMPLE
  ./scripts/api-test.ps1 test/billing.test.ts test/search-intelligence-managed.test.ts
.EXAMPLE
  ./scripts/api-test.ps1 -Types     # regenerate src/generated/db-schema.ts after a baseline change
.EXAMPLE
  ./scripts/api-test.ps1 -Migrate   # apply the SQL baseline to a fresh local database
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [switch] $Types,
    [switch] $Migrate,
    [ValidatePattern('^\d+$')][string] $Port = '55432',
    [Parameter(Position = 0, ValueFromRemainingArguments)][string[]] $Files = @()
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$api = Join-Path $root 'frontend/services/api'
$envFile = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Copy .env.example to .env first.' }

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)=(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim().Trim("'", '"')
    }
}
foreach ($name in 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB') {
    if (-not $settings[$name]) { throw "$name is missing from .env." }
}
$password = [uri]::EscapeDataString($settings.POSTGRES_PASSWORD)
$url = "postgresql://$($settings.POSTGRES_USER):$password@127.0.0.1:$Port/$($settings.POSTGRES_DB)"

# Tests must never inherit live provider credentials.
Get-ChildItem env: |
    Where-Object { $_.Name -match '(_API_KEY|_API_LOGIN|_API_PASSWORD|_CLIENT_SECRET|_CLIENT_ID|_KEY_SECRET)$' -or $_.Name -like 'DEFAULT_AGENT_*' } |
    ForEach-Object { Remove-Item -LiteralPath "env:$($_.Name)" }

$gitDir = (& git -C $root rev-parse --absolute-git-dir).Trim()
$log = Join-Path $gitDir 'api-test.log'

Push-Location $api
try {
    if ($Migrate) {
        $env:DATABASE_URL = $url
        & pnpm migrate *> $log
    }
    elseif ($Types) {
        $env:TYPES_DATABASE_URL = $url
        & pnpm db:types *> $log
    }
    else {
        $env:API_TEST_DATABASE_URL = $url
        & pnpm exec vitest run @Files *> $log
    }
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
}
Get-Content -LiteralPath $log -Tail 40
Write-Output "exit $code (full log: $log)"
exit $code
