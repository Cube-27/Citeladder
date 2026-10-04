param(
    [Parameter(Mandatory)][string] $Email,
    [Parameter(Mandatory)][string] $Password,
    [Parameter(Mandatory)][int] $CounterAllowance
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$saved = @{}
Push-Location (Join-Path $root 'backend')
try {
    # Reuse the reset/provision configuration loader, resolving once for both
    # owners. Capture its JSON privately; never emit credential-bearing config.
    $configurationScript = @'
import importlib.util, json, os
from pathlib import Path
spec = importlib.util.spec_from_file_location("reset_configuration", Path("../reset-db.py").resolve())
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
disabled = os.environ.get("CITELADDER_DISABLE_DOTENV", "").lower() in {"1", "true", "yes", "on"}
print(json.dumps(dict(os.environ) if disabled else module._configuration()))
'@
    $configurationJson = & uv run python -c $configurationScript
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve local provisioning configuration.' }
    $configuration = $configurationJson | ConvertFrom-Json -AsHashtable
    foreach ($name in $configuration.Keys) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $configuration[$name], 'Process')
    }
    if (-not $saved.ContainsKey('CITELADDER_DISABLE_DOTENV')) {
        $saved['CITELADDER_DISABLE_DOTENV'] = [Environment]::GetEnvironmentVariable('CITELADDER_DISABLE_DOTENV', 'Process')
    }
    $env:CITELADDER_DISABLE_DOTENV = '1'
    & uv run python -m scripts.provision_dev_login --email $Email --password $Password --counter-allowance $CounterAllowance
    if ($LASTEXITCODE -ne 0) { throw 'Development identity provisioning failed.' }
    & node (Join-Path $root 'frontend/services/api/src/cli/bootstrap-catalog.ts') --actor $Email
    if ($LASTEXITCODE -ne 0) { throw 'Catalog initialization failed; retry provisioning.' }
} finally {
    Pop-Location
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
