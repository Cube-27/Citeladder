param(
    [ValidateSet('up', 'down', 'tunnel', 'status', 'admin', 'plans', 'reconcile')][string] $Action = 'up',
    [string] $EnvFile = 'billing-test.env',
    [string[]] $CommandArgs = @()
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$selected = (Resolve-Path (Join-Path $root $EnvFile)).Path
if ($selected -eq (Join-Path $root '.env')) { throw 'Use a dedicated billing-test environment.' }
$values = @{}
foreach ($line in Get-Content -LiteralPath $selected) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim("'", '"') }
}
if ($values.BILLING_RAZORPAY_MODE -ne 'test' -or $values.BILLING_RAZORPAY_KEY_ID -notlike 'rzp_test_*') {
    throw 'Billing staging requires test mode and a test key.'
}
if ($values.POSTGRES_DB -ne 'citeladder_billing_test' -or $values.DEMO_MODE -ne 'false' -or $values.DEV_LOGIN_PASSWORD) {
    throw 'Billing staging requires its isolated database and disabled bootstrap.'
}
foreach ($entry in $values.GetEnumerator()) {
    if (($entry.Key -match '^PROVIDER_PLATFORM_.*(API_KEY|CREDENTIAL_REF)$' -or $entry.Key -eq 'BILLING_RAZORPAY_LIVE_READY') -and $entry.Value -and $entry.Value -ne 'false') {
        throw 'Live readiness and platform credential escape hatches must be disabled.'
    }
}
$names = @('POSTGRES_PASSWORD', 'POSTGRES_USER', 'POSTGRES_DB', 'DATABASE_URL', 'COMPOSE_PROJECT_NAME', 'CITELADDER_ENV_FILE', 'CITELADDER_DISABLE_DOTENV') + @($values.Keys)
$saved = @{}
foreach ($name in $names | Select-Object -Unique) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
Push-Location $root
try {
    foreach ($entry in $values.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
    $env:CITELADDER_ENV_FILE = $selected
    $composeArgs = @('compose', '--project-name', 'citeladder-billing-test', '--env-file', $selected, '-f', 'docker-compose.yml', '-f', 'infra/compose.billing-test.yml')
    switch ($Action) {
        up { & docker @composeArgs up -d --build }
        down { & docker @composeArgs down }
        status { & docker @composeArgs ps }
        tunnel { & cloudflared tunnel --url http://127.0.0.1:8301 --no-autoupdate }
        { $_ -in @('admin', 'plans', 'reconcile') } {
            $databaseUser = if ($values.POSTGRES_USER) { $values.POSTGRES_USER } else { 'postgres' }
            $encodedUser = [Uri]::EscapeDataString($databaseUser)
            $encodedPassword = [Uri]::EscapeDataString($values.POSTGRES_PASSWORD)
            $env:DATABASE_URL = "postgresql+asyncpg://${encodedUser}:${encodedPassword}@127.0.0.1:55433/citeladder_billing_test"
            $env:CITELADDER_DISABLE_DOTENV = '1'
            $modules = @{ admin = 'scripts.billing_admin'; plans = 'scripts.provision_razorpay_plans'; reconcile = 'scripts.reconcile_billing' }
            $python = Join-Path $root 'backend/.venv/Scripts/python.exe'
            if (-not (Test-Path -LiteralPath $python)) { throw 'Install backend dependencies with uv sync --frozen --extra dev first.' }
            Push-Location (Join-Path $root 'backend')
            try { & $python -m $modules[$Action] @CommandArgs } finally { Pop-Location }
        }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Billing staging command failed.' }
} finally {
    Pop-Location
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
