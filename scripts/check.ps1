param(
    [ValidateSet("Changed", "All", "Backend", "Frontend", "Contract")]
    [string] $Scope = "Changed",
    [switch] $Fix,
    [switch] $CheckOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ($Fix -and $CheckOnly) { throw "-Fix and -CheckOnly cannot be combined." }
$mode = if ($Fix) { "fix" } else { "check" }

Push-Location $repoRoot
try {
    & node scripts/quality.mjs --mode $mode --scope $Scope.ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw "Quality gate failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
