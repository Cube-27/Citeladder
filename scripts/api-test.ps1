<#
.SYNOPSIS
  Runs API tests against the one local development database.

.DESCRIPTION
  Pre-launch there are no customers, so the API suite uses the local database
  from docker compose instead of per-branch copies that nobody drops. The URL
  comes from the shared .env reader (src/cli/local-environment.ts) that the
  reset and seed tools use, and the credentials the test guard refuses are
  cleared first; nothing secret is printed. Output goes to one reusable log in
  this worktree's Git directory. After a baseline change, the owner resets the
  database with scripts/reset-db.ps1.

.EXAMPLE
  ./scripts/api-test.ps1 test/billing.test.ts test/search-intelligence-managed.test.ts
.EXAMPLE
  ./scripts/api-test.ps1 -Types   # regenerate src/generated/db-schema.ts after a baseline change
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [switch] $Types,
    [Parameter(Position = 0, ValueFromRemainingArguments)][string[]] $Files = @()
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$api = Join-Path $root 'frontend/services/api'
$log = Join-Path (& git -C $root rev-parse --absolute-git-dir).Trim() 'api-test.log'

Push-Location $api
try {
    $local = & node test/local-test-environment.ts | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the local database from .env.' }
    foreach ($name in $local.clear) { Remove-Item -LiteralPath "env:$name" }
    if ($Types) {
        $env:TYPES_DATABASE_URL = $local.url
        & pnpm db:types *> $log
    }
    else {
        $env:API_TEST_DATABASE_URL = $local.url
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
