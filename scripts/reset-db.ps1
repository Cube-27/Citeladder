# Protected local reset: drop/recreate, the SQL baseline, then the configured login.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $root 'frontend/services/api/src/cli/reset-database.ts')
if ($LASTEXITCODE -ne 0) { throw 'Database reset/provisioning failed.' }
