param(
    [Parameter(Mandatory)][string] $Email,
    [Security.SecureString] $Password,
    [Parameter(Mandatory)][int] $CounterAllowance
)
$ErrorActionPreference = 'Stop'
if (-not $Password) { $Password = Read-Host 'Development login password' -AsSecureString }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$plaintext = [Net.NetworkCredential]::new('', $Password).Password
try {
    $plaintext | & node (Join-Path $root 'frontend/services/api/src/cli/provision-dev-login.ts') --email $Email --password-stdin --counter-allowance $CounterAllowance
    if ($LASTEXITCODE -ne 0) { throw 'Development provisioning failed; retry after correcting configuration.' }
} finally { $plaintext = $null }
