<#
.SYNOPSIS
  Scans the branch's changed files with the same gitleaks version and allowlist as CI.

.DESCRIPTION
  CI's secrets scan reads the whole checkout; locally only the files that differ
  from origin/main (committed, staged, unstaged and untracked) are copied to a
  temporary directory and scanned, so a false positive is found before a push
  instead of after a CI cycle. Needs Docker; without it the scan is skipped
  with a warning and CI remains the gate.
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$image = 'ghcr.io/gitleaks/gitleaks:v8.30.1'   # keep in step with GITLEAKS_VERSION in ci.yml

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning 'Docker is unavailable; skipping the local secrets scan (CI still runs it).'
    exit 0
}

$base = (& git -C $root merge-base HEAD origin/main).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot find the merge base with origin/main.' }
$changed = @(
    & git -C $root diff --name-only --diff-filter=d $base
    & git -C $root ls-files --others --exclude-standard
) | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf }
if (-not $changed) {
    Write-Output 'Secrets scan: no changed files.'
    exit 0
}

$scan = Join-Path ([IO.Path]::GetTempPath()) "citeladder-secrets-$([guid]::NewGuid().ToString('N'))"
try {
    foreach ($path in $changed) {
        $target = Join-Path $scan $path
        New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
        Copy-Item -LiteralPath (Join-Path $root $path) -Destination $target
    }
    Copy-Item -LiteralPath (Join-Path $root '.gitleaks.toml') -Destination (Join-Path $scan '.gitleaks.toml')
    & docker run --rm -v "${scan}:/scan" -w /scan $image dir . --no-banner --redact --config .gitleaks.toml
    $code = $LASTEXITCODE
}
finally {
    Remove-Item -LiteralPath $scan -Recurse -Force -ErrorAction SilentlyContinue
}
if ($code -eq 0) { Write-Output "Secrets scan: $($changed.Count) changed files clean." }
exit $code
