param([switch] $CheckOnly)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mode = if ($CheckOnly) { "check" } else { "fix" }
$gitDirectory = (& git -C $repoRoot rev-parse --absolute-git-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the worktree Git directory.' }
try {
    $checkLock = [IO.File]::Open((Join-Path $gitDirectory 'citeladder-check.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
}
catch [IO.IOException] {
    throw 'A check is already running in this worktree. Wait for it to finish.'
}

Push-Location $repoRoot
try {
    & node scripts/quality.mjs --mode $mode --scope all
    if ($LASTEXITCODE -ne 0) { throw "Quality gate failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
    $checkLock.Dispose()
}
