<#
.SYNOPSIS
Interactive account management for the deployed CiteLadder app.
.EXAMPLE
./scripts/provision-dev-login.ps1
.EXAMPLE
./scripts/provision-dev-login.ps1 -UseExistingTunnel -LocalPort 15432
#>
param(
    [string] $ProjectId = 'project-setup-20260711',
    [string] $Zone = 'us-central1-a',
    [string] $DatabaseInstance = 'citeladder-db',
    [string] $DatabaseSecret = 'citeladder-database-url',
    [string] $OperatorPasswordSecret = 'citeladder-demo-password',
    [string] $Actor = 'dev@citeladder.com',
    [ValidateRange(1024, 65535)][int] $LocalPort = 15432,
    [switch] $UseExistingTunnel
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$environmentNames = @('DATABASE_URL', 'DB_SSL_MODE', 'CITELADDER_DISABLE_DOTENV', 'ACCOUNT_MANAGER_OPERATOR_PASSWORD')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$tunnel = $null
$productionDatabase = $null
$operatorPassword = $null

function Invoke-GcloudRead {
    param([string[]] $Arguments)
    $value = & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'GCP access failed. Check your gcloud login and project permissions.' }
    return ($value -join "`n").Trim()
}

try {
    Get-Command node, gcloud, pwsh -ErrorAction Stop | Out-Null
    $instance = (Invoke-GcloudRead -Arguments @('compute', 'instances', 'describe', $DatabaseInstance, "--project=$ProjectId", "--zone=$Zone", '--format=json')) | ConvertFrom-Json
    $productionDatabase = Invoke-GcloudRead -Arguments @('secrets', 'versions', 'access', 'latest', "--secret=$DatabaseSecret", "--project=$ProjectId")
    $databaseUri = [UriBuilder]$productionDatabase
    if ($databaseUri.Host -ne $instance.networkInterfaces[0].networkIP) {
        throw 'The database secret does not target the selected production database instance.'
    }
    if ($Actor -eq 'dev@citeladder.com') {
        $operatorPassword = Invoke-GcloudRead -Arguments @('secrets', 'versions', 'access', 'latest', "--secret=$OperatorPasswordSecret", "--project=$ProjectId")
    }
    Write-Host "Production: project $ProjectId, database $DatabaseInstance, operator $Actor"
    if (-not $UseExistingTunnel) {
        if (Get-NetTCPConnection -State Listen -LocalPort $LocalPort -ErrorAction SilentlyContinue) {
            throw "Port $LocalPort is already in use. Choose another -LocalPort or use your existing authenticated tunnel with -UseExistingTunnel."
        }
        # Foreground authentication lets gcloud verify/cache the SSH host key in the user's terminal.
        & gcloud compute ssh $DatabaseInstance "--project=$ProjectId" "--zone=$Zone" --tunnel-through-iap --command=true
        if ($LASTEXITCODE -ne 0) { throw 'Production SSH authentication failed.' }
        $start = [Diagnostics.ProcessStartInfo]::new()
        $start.FileName = (Get-Command pwsh).Source
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        # pwsh -File needs the SDK's PowerShell launcher, not gcloud.cmd.
        $gcloudScript = Join-Path (Split-Path (Get-Command gcloud).Source) 'gcloud.ps1'
        foreach ($argument in @('-NoProfile', '-File', $gcloudScript,
            'compute', 'ssh', $DatabaseInstance, "--project=$ProjectId", "--zone=$Zone", '--tunnel-through-iap',
            '--quiet', '--command=sleep 86400', '--ssh-flag=-batch', '--ssh-flag=-L', '--ssh-flag',
            "127.0.0.1:${LocalPort}:127.0.0.1:$($databaseUri.Port)")) {
            $start.ArgumentList.Add($argument)
        }
        $tunnel = [Diagnostics.Process]::new()
        $tunnel.StartInfo = $start
        if (-not $tunnel.Start()) { throw 'Could not start the production database tunnel.' }
        $tunnelOutput = $tunnel.StandardOutput.ReadToEndAsync()
        $tunnelError = $tunnel.StandardError.ReadToEndAsync()
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        $connected = $false
        while (-not $connected -and [DateTime]::UtcNow -lt $deadline) {
            if ($tunnel.HasExited) {
                $diagnostic = $tunnelError.GetAwaiter().GetResult().Trim()
                if ($diagnostic) { Write-Warning $diagnostic }
                throw 'The production database tunnel stopped. Check SSH/IAP permissions and host-key verification.'
            }
            $probe = [Net.Sockets.TcpClient]::new()
            try {
                $connection = $probe.ConnectAsync('127.0.0.1', $LocalPort)
                $connected = $connection.Wait(250) -and $probe.Connected
            } catch { $connected = $false } finally { $probe.Dispose() }
            if (-not $connected) { Start-Sleep -Milliseconds 250 }
        }
        if (-not $connected) { throw 'Production database tunnel did not become ready within 45 seconds.' }
    }
    $databaseUri.Host = '127.0.0.1'
    $databaseUri.Port = $LocalPort
    $env:DATABASE_URL = $databaseUri.Uri.AbsoluteUri
    # Transport encryption is supplied by the authenticated IAP/SSH tunnel.
    $env:DB_SSL_MODE = 'disable'
    $env:CITELADDER_DISABLE_DOTENV = '1'
    $env:ACCOUNT_MANAGER_OPERATOR_PASSWORD = $operatorPassword
    & node (Join-Path $root 'frontend/services/api/src/cli/account-manager.ts') --platform --actor $Actor
    if ($LASTEXITCODE -ne 0) { throw 'Account management failed; no further operations were attempted.' }
} finally {
    if ($tunnel) {
        if (-not $tunnel.HasExited) { $tunnel.Kill($true); $tunnel.WaitForExit() }
        $tunnel.Dispose()
    }
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
    $productionDatabase = $null
    $operatorPassword = $null
    $databaseUri = $null
}
