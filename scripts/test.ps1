param(
    [string[]] $ChangedFiles = @(),
    [ValidateSet('Minor', 'Feature', 'Risky')]
    [string] $Risk = 'Feature',
    [ValidateSet('All', 'Backend', 'Frontend', 'Tool', 'E2E')]
    [string] $Owner = 'All',
    [switch] $PlanOnly
)

$ErrorActionPreference = "Stop"
$selectedOwner = $Owner
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "validation.json") -Raw |
    ConvertFrom-Json -AsHashtable
$gitDirectory = (& git -C $repoRoot rev-parse --absolute-git-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the worktree Git directory.' }
$statePath = Join-Path $gitDirectory 'citeladder-test-state.json'
$lockPath = Join-Path $gitDirectory 'citeladder-test.lock'

if ($Risk -eq 'Minor') {
    Write-Host 'Minor change: no tests selected.'
    exit 0
}

# Deliberately fixed. Agents may narrow a retry to files changed after a failed
# run, but may not redefine the repository comparison base.
$baseRef = "origin/main"

function Enter-TestLock {
    # The OS releases this exclusive handle even when the runner crashes.
    # Never kill processes by name: they may belong to another workspace.
    try {
        return [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    }
    catch [IO.IOException] {
        throw 'A test run is already active in this worktree. Wait for that run.'
    }
}

function Invoke-Step {
    param([string] $Name, [scriptblock] $Command)

    Write-Host "`n==> $Name" -ForegroundColor Cyan
    $logPath = Join-Path $gitDirectory ("citeladder-test-" + ($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-') + '.log')
    try {
        & $Command *> $logPath
        if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
    }
    catch {
        Get-Content -LiteralPath $logPath -Tail 60 -ErrorAction SilentlyContinue
        Write-Host "Full output: $logPath"
        throw
    }
    Write-Host "$Name passed. Log: $logPath" -ForegroundColor Green
}

function Read-TestState {
    if (-not (Test-Path -LiteralPath $statePath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }
    catch {
        Write-Warning 'Unreadable prior run record; selecting the requested scope afresh.'
        return $null
    }
}

function Get-StateValues {
    param($Value)

    if ($null -eq $Value) { return @() }
    return @($Value | ForEach-Object { [string] $_ })
}

function Get-StateGroup {
    param($State, [string] $Owner)

    if ($null -eq $State -or $null -eq $State.groups) { return @() }
    $property = $State.groups.PSObject.Properties[$Owner]
    if ($null -eq $property) { return @() }
    return Get-StateValues $property.Value
}

function Get-PathDigest {
    param([string] $Path)

    $absolutePath = Join-Path $repoRoot $Path
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) { return "<deleted>" }
    return (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash
}

function Get-PathDigests {
    param([string[]] $Paths)

    $digests = [ordered]@{}
    foreach ($path in $Paths) { $digests[$path] = Get-PathDigest $path }
    return $digests
}

function Get-InvalidatedPaths {
    param($State, [string[]] $CurrentPaths)

    $previous = @{}
    foreach ($property in $State.pathDigests.PSObject.Properties) {
        $previous[$property.Name] = [string] $property.Value
    }
    return @(
        $CurrentPaths | Where-Object {
            -not $previous.ContainsKey($_) -or $previous[$_] -ne (Get-PathDigest $_)
        }
    )
}

function Write-TestState {
    param($State)

    $json = $State | ConvertTo-Json -Depth 8
    [IO.File]::WriteAllText(
        $statePath,
        $json + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )
}

function Update-TestStateStatus {
    param($State, [string] $Status, [string[]] $CompletedOwners)

    $State.status = $Status
    $State.completedOwners = @($CompletedOwners | Sort-Object -Unique)
    Write-TestState $State
}

function Get-BackendPython {
    foreach ($path in @("backend/.venv/Scripts/python.exe", "backend/.venv/bin/python")) {
        $candidate = Join-Path $repoRoot $path
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "Backend virtual environment missing. Run 'uv sync --frozen --extra dev' in backend/."
}

function Invoke-BackendPython {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

    $python = Get-BackendPython
    Push-Location (Join-Path $repoRoot "backend")
    try { & $python @Arguments } finally { Pop-Location }
}

function Invoke-FrontendPnpm {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

    $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpmCommand) {
        throw "pnpm missing from PATH. CiteLadder is pnpm-only; never substitute npm or yarn."
    }
    $invokeArguments = $Arguments
    if ($pnpmCommand.Path -and $pnpmCommand.Path.EndsWith(".cmd", "OrdinalIgnoreCase")) {
        # PowerShell invokes a .cmd shim through cmd.exe, which reparses
        # parentheses and other metacharacters in Next.js route-group paths.
        # Embedded quotes survive PowerShell and keep each argument intact for
        # the shim; native/PowerShell pnpm launchers must receive plain values.
        $invokeArguments = @(
            $Arguments | ForEach-Object {
                if ($_ -match '[&|<>()^]') { '"' + $_.Replace('"', '""') + '"' }
                else { $_ }
            }
        )
    }
    Push-Location (Join-Path $repoRoot "frontend")
    try { & $pnpmCommand.Path @invokeArguments } finally { Pop-Location }
}

function Invoke-FrontendTests {
    param([string[]] $Tests)

    # Keep the exact mapped selection on Windows instead of silently widening
    # a long command line to the entire frontend owner.
    $batch = [Collections.Generic.List[string]]::new()
    $batchLength = 0
    foreach ($test in $Tests) {
        if ($batch.Count -ge 75 -or ($batchLength + $test.Length + 1) -gt 6000) {
            $batchArguments = @($batch)
            Invoke-FrontendPnpm exec vitest run --bail=1 --reporter=dot @batchArguments
            if ($LASTEXITCODE -ne 0) { throw 'Frontend test batch failed.' }
            $batch.Clear()
            $batchLength = 0
        }
        [void] $batch.Add($test)
        $batchLength += $test.Length + 1
    }
    if ($batch.Count -gt 0) {
        $batchArguments = @($batch)
        Invoke-FrontendPnpm exec vitest run --bail=1 --reporter=dot @batchArguments
        if ($LASTEXITCODE -ne 0) { throw 'Frontend test batch failed.' }
    }
}

function Invoke-GitPaths {
    param([string[]] $Arguments)

    $output = @(& git -C $repoRoot @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed." }
    return @(
        $output |
            Where-Object { $_ } |
            ForEach-Object { $_.Replace("\", "/") }
    )
}

function Get-MergeBase {
    & git -C $repoRoot rev-parse --verify --quiet $baseRef *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Base ref '$baseRef' cannot be resolved. Run 'git fetch origin main'."
    }

    $output = @(& git -C $repoRoot merge-base $baseRef HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) {
        throw "Unable to determine merge base for '$baseRef'."
    }
    return [string] $output[0]
}

function Get-AllChangedPaths {
    param([string] $MergeBase)

    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    function Add-Paths {
        param([string[]] $Arguments)

        foreach ($path in @(Invoke-GitPaths $Arguments)) { [void] $paths.Add($path) }
    }

    # A rename is a deletion plus an addition so the new path receives mapping.
    Add-Paths @("diff", "--no-renames", "--name-only", "--diff-filter=ACMDT", "$MergeBase..HEAD")
    Add-Paths @("diff", "--no-renames", "--name-only", "--diff-filter=ACMDT")
    Add-Paths @("diff", "--cached", "--no-renames", "--name-only", "--diff-filter=ACMDT")
    Add-Paths @("ls-files", "--others", "--exclude-standard")
    return @($paths | Sort-Object)
}

function Convert-ToRepositoryPath {
    param([string] $Path)

    $candidate = $Path.Trim().Trim('"').Replace("\", "/")
    if (-not $candidate) { throw "ChangedFiles contains an empty path." }

    $absolutePath = if ([IO.Path]::IsPathRooted($candidate)) {
        [IO.Path]::GetFullPath($candidate)
    }
    else {
        [IO.Path]::GetFullPath((Join-Path $repoRoot $candidate))
    }
    $relativePath = [IO.Path]::GetRelativePath($repoRoot, $absolutePath).Replace("\", "/")
    if ($relativePath -eq ".." -or $relativePath.StartsWith("../")) {
        throw "Changed file '$Path' is outside the repository."
    }
    return $relativePath
}

function Select-RequestedChangedPaths {
    param([string[]] $AllChangedPaths, [string[]] $RequestedPaths)

    if ($RequestedPaths.Count -eq 0) { return @($AllChangedPaths) }

    $available = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $AllChangedPaths) { [void] $available.Add($path) }

    $selected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $RequestedPaths) {
        $repositoryPath = Convert-ToRepositoryPath $path
        if (-not $available.Contains($repositoryPath)) {
            throw "Changed file '$repositoryPath' is not in the current repository diff."
        }
        [void] $selected.Add($repositoryPath)
    }
    return @($selected | Sort-Object)
}

function Convert-GlobToRegex {
    param([string] $Pattern)

    $normalized = $Pattern.Replace("\", "/")
    $builder = [Text.StringBuilder]::new("^")
    $index = 0

    while ($index -lt $normalized.Length) {
        $character = $normalized[$index]
        if ($character -eq "*") {
            $isDoubleStar = (
                $index + 1 -lt $normalized.Length -and $normalized[$index + 1] -eq "*"
            )
            if ($isDoubleStar) {
                $followedBySlash = (
                    $index + 2 -lt $normalized.Length -and $normalized[$index + 2] -eq "/"
                )
                if ($followedBySlash) {
                    [void] $builder.Append("(?:.*/)?")
                    $index += 3
                }
                else {
                    [void] $builder.Append(".*")
                    $index += 2
                }
            }
            else {
                [void] $builder.Append("[^/]*")
                $index++
            }
            continue
        }

        if ($character -eq "?") { [void] $builder.Append("[^/]") }
        else { [void] $builder.Append([Regex]::Escape([string] $character)) }
        $index++
    }

    [void] $builder.Append("$")
    return $builder.ToString()
}

function Test-AnyPathMatches {
    param([string[]] $Paths, [string[]] $Patterns)

    foreach ($pattern in @($Patterns)) {
        $regex = Convert-GlobToRegex $pattern
        foreach ($path in @($Paths)) {
            if ($path -match $regex) { return $true }
        }
    }
    return $false
}

function Add-Patterns {
    param([Collections.Generic.HashSet[string]] $Target, $Patterns)

    foreach ($pattern in @($Patterns)) {
        if ($pattern) { [void] $Target.Add([string] $pattern) }
    }
}

function Get-NearestRuleHint {
    param([string] $Path)

    # An unmapped file is nearly always a sibling of something already mapped.
    # Naming that neighbour lets a mapping be added with a targeted edit instead
    # of a read of the whole mapping file.
    $directory = ([IO.Path]::GetDirectoryName($Path) ?? "").Replace("\", "/")
    if (-not $directory) { return $null }

    $segments = @($directory -split "/" | Where-Object { $_ })
    $best = $null
    $bestShared = 0
    foreach ($rule in $config.rules) {
        foreach ($source in @($rule.sources)) {
            $prefix = (([string] $source) -split '\*')[0].TrimEnd("/")
            if (-not $prefix) { continue }

            $candidate = @($prefix -split "/" | Where-Object { $_ })
            $shared = 0
            while (
                $shared -lt $segments.Count -and
                $shared -lt $candidate.Count -and
                $segments[$shared] -eq $candidate[$shared]
            ) { $shared++ }

            if ($shared -gt $bestShared) {
                $best = $rule
                $bestShared = $shared
            }
        }
    }
    if ($null -eq $best) { return $null }

    $tests = @(
        @($best.backendTests) + @($best.frontendTests) + @($best.frontendE2E) |
            Where-Object { $_ }
    )
    return "$($best.sources -join ', ') -> $($tests -join ', ')"
}

function Resolve-TestPatterns {
    param([string] $Root, [string[]] $Patterns, [string[]] $Extensions)

    if ($Patterns.Count -eq 0) { return @() }
    if (-not (Get-Command rg -ErrorAction SilentlyContinue)) {
        throw "ripgrep ('rg') missing from PATH."
    }

    Push-Location $Root
    try { $files = @(& rg --files) } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Unable to enumerate test files under '$Root'." }
    $files = @(
        $files |
            ForEach-Object { $_.Replace("\", "/") } |
            Where-Object { [IO.Path]::GetExtension($_) -in $Extensions }
    )

    $selected = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($pattern in $Patterns) {
        $regex = Convert-GlobToRegex $pattern
        foreach ($file in $files) {
            if ($file -match $regex) { [void] $selected.Add($file) }
        }
    }
    return @($selected | Sort-Object)
}

function Select-ProductionPaths {
    param([string[]] $Paths, [string[]] $Roots, [string[]] $Extensions)

    # Tests colocate with the code they cover, so a changed test file lives under
    # a production root. It runs itself through the branch above and never needs
    # its own mapping entry.
    return @(
        $Paths | Where-Object {
            $path = $_
            $extension = [IO.Path]::GetExtension($path)
            ($extension -in $Extensions) -and
            ($path -notmatch '\.(test|spec)\.(ts|tsx|js|jsx|mjs)$') -and
            ($path -notmatch '(^|/)tests?/') -and
            (@($Roots | Where-Object { $path.StartsWith("$_/", "OrdinalIgnoreCase") }).Count -gt 0)
        }
    )
}

$testLock = if (-not $PlanOnly) { Enter-TestLock } else { $null }
try {
$mergeBase = Get-MergeBase
$allChangedPaths = @(Get-AllChangedPaths $mergeBase)
$requestedChangedPaths = @(Select-RequestedChangedPaths $allChangedPaths $ChangedFiles)
$retryState = Read-TestState
if ($null -ne $retryState -and (
    $retryState.schema -ne 2 -or $retryState.mergeBase -ne $mergeBase -or
    $retryState.risk -ne $Risk -or $retryState.owner -ne $selectedOwner -or
    $null -eq $retryState.pathDigests -or
    $retryState.status -notin @('running', 'failed', 'succeeded')
)) { $retryState = $null }

# Reuse completed evidence. Only edits in this selection or the previous run
# invalidate it; unrelated work in a dirty tree does not widen an explicit scope.
$changedPaths = @($requestedChangedPaths)
if ($null -ne $retryState) {
    $candidates = @(@($requestedChangedPaths) + @($retryState.changedPaths) | Sort-Object -Unique)
    $changedPaths = @(Get-InvalidatedPaths $retryState $candidates)
    if ($changedPaths.Count -eq 0 -and $retryState.status -eq 'succeeded') {
        Write-Host 'Selected changes already passed. No tests rerun.' -ForegroundColor Green
        exit 0
    }
}
if ($changedPaths.Count -eq 0 -and $null -eq $retryState -and $Risk -ne 'Risky') {
    Write-Host 'No changed paths selected.' -ForegroundColor Green
    exit 0
}

$mode = if ($ChangedFiles.Count -gt 0) { "retry delta" } else { "full working diff" }
Write-Host "Selecting tests for $($changedPaths.Count) path(s) from $mode." -ForegroundColor Cyan

$backendPatterns = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$toolTests = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$frontendPatterns = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$e2ePatterns = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$mappedBackendPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$mappedFrontendPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$matchedRules = [Collections.Generic.List[object]]::new()

$backendSourcePaths = @(
    Select-ProductionPaths $changedPaths @($config.backendRoots) @($config.backendExtensions)
)
$frontendSourcePaths = @(
    Select-ProductionPaths $changedPaths @($config.frontendRoots) @($config.frontendExtensions)
)

# A changed test always runs itself.
foreach ($path in $changedPaths) {
    $exists = Test-Path -LiteralPath (Join-Path $repoRoot $path)
    if (-not $exists) { continue }
    if ($path -match '^backend/tests/(?:.+/)?test_[^/]+\.py$') {
        Add-Patterns $backendPatterns @($path.Substring("backend/".Length))
    }
    elseif ($path -match '^scripts/.+\.(test)\.(js|mjs)$') {
        Add-Patterns $toolTests @($path)
    }
    elseif ($path -match '^frontend/e2e/.+\.spec\.(ts|tsx|js|jsx|mjs)$') {
        Add-Patterns $e2ePatterns @($path.Substring("frontend/".Length))
    }
    elseif ($path -match '^frontend/.+\.(test|spec)\.(ts|tsx|js|jsx|mjs)$') {
        Add-Patterns $frontendPatterns @($path.Substring("frontend/".Length))
    }
}

# Rules are additive. Each production path must have an explicit mapping.
foreach ($rule in $config.rules) {
    $matchingPaths = @($changedPaths | Where-Object { Test-AnyPathMatches @($_) @($rule.sources) })
    if ($matchingPaths.Count -eq 0) { continue }

    [void] $matchedRules.Add([pscustomobject]@{
            Sources = @($rule.sources)
            ChangedPaths = @($matchingPaths)
            BackendPatterns = @(if ($rule.backendTests) { $rule.backendTests } else { @() })
            FrontendPatterns = @(if ($rule.frontendTests) { $rule.frontendTests } else { @() })
            E2EPatterns = @(if ($rule.frontendE2E) { $rule.frontendE2E } else { @() })
        })

    if ($rule.backendTests) {
        Add-Patterns $backendPatterns $rule.backendTests
        foreach ($path in $backendSourcePaths) {
            if (Test-AnyPathMatches @($path) @($rule.sources)) {
                [void] $mappedBackendPaths.Add($path)
            }
        }
    }
    if ($rule.frontendTests) { Add-Patterns $frontendPatterns $rule.frontendTests }
    if ($rule.frontendE2E) { Add-Patterns $e2ePatterns $rule.frontendE2E }
    if ($rule.frontendTests -or $rule.frontendE2E) {
        foreach ($path in $frontendSourcePaths) {
            if (Test-AnyPathMatches @($path) @($rule.sources)) {
                [void] $mappedFrontendPaths.Add($path)
            }
        }
    }
}

# A failed or interrupted run may have stopped before later owners executed.
# Re-add those exact selections before resolving the new retry delta.
$pendingOwners = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if ($null -ne $retryState) {
    foreach ($owner in @("tool", "backend", "frontend", "e2e")) {
        $priorGroup = @(Get-StateGroup $retryState $owner)
        if ($priorGroup.Count -gt 0 -and (Get-StateValues $retryState.completedOwners) -notcontains $owner) {
            [void] $pendingOwners.Add($owner)
            switch ($owner) {
                "tool" { Add-Patterns $toolTests $priorGroup }
                "backend" { Add-Patterns $backendPatterns $priorGroup }
                "frontend" { Add-Patterns $frontendPatterns $priorGroup }
                "e2e" { Add-Patterns $e2ePatterns $priorGroup }
            }
        }
    }
}

$unmappedPaths = @(
    $backendSourcePaths | Where-Object { -not $mappedBackendPaths.Contains($_) }
    $frontendSourcePaths | Where-Object { -not $mappedFrontendPaths.Contains($_) }
)
$usedMappingFallback = $false
if ($unmappedPaths.Count -gt 0) {
    # An unmapped production file used to be fatal, which stalled the task on a
    # read-and-edit of the whole mapping file. The nudge to add a mapping
    # survives as a warning; the stall does not.
    $usedMappingFallback = $true
    Write-Host "`nProduction files lack test mappings in scripts/validation.json:" -ForegroundColor Yellow
    foreach ($path in @($unmappedPaths | Sort-Object)) {
        Write-Host " - $path" -ForegroundColor Yellow
        $hint = Get-NearestRuleHint $path
        if ($hint) { Write-Host "   nearest rule: $hint" -ForegroundColor DarkYellow }
    }
    Write-Host "Falling back to the narrowest honest selection for each owner. Add a mapping when the change has a credible regression path." -ForegroundColor Yellow

    # Both fallbacks stay narrow on purpose: a wide one is as expensive as the
    # stall it replaced. Backend tests live in a central tree and are named
    # after the feature they cover, so the changed file's own feature segment
    # selects them. Frontend tests colocate, so the file's directory does.
    # Either may resolve to nothing for genuinely new code -- the warning
    # above, and CI's full suite, are what cover that case.
    foreach ($path in @($unmappedPaths | Where-Object { $_.StartsWith("backend/app/", "OrdinalIgnoreCase") })) {
        $relative = $path.Substring("backend/app/".Length)
        $segments = @($relative -split "/" | Where-Object { $_ })
        $feature = if ($segments.Count -gt 1) {
            $segments[$segments.Count - 2]
        }
        else {
            [IO.Path]::GetFileNameWithoutExtension($relative)
        }
        if (-not $feature) { continue }
        Add-Patterns $backendPatterns @(
            "tests/unit/test_$feature*.py",
            "tests/component/test_$feature*.py"
        )
    }
    foreach ($path in @($unmappedPaths | Where-Object { $_.StartsWith("frontend/", "OrdinalIgnoreCase") })) {
        $directory = ([IO.Path]::GetDirectoryName($path) ?? "").Replace("\", "/")
        if ($directory.Length -le "frontend".Length) { continue }
        $relative = $directory.Substring("frontend/".Length)
        Add-Patterns $frontendPatterns @("$relative/*.test.ts", "$relative/*.test.tsx")
    }
}

if ($Risk -eq 'Risky') {
    Add-Patterns $backendPatterns @('tests/**/test_*.py')
    Add-Patterns $frontendPatterns @('**/*.test.ts', '**/*.test.tsx')
    Add-Patterns $toolTests @(Resolve-TestPatterns $repoRoot @('scripts/*.test.mjs') @('.mjs'))
    Add-Patterns $e2ePatterns @('e2e/*.spec.ts')
}

$backendTests = @(Resolve-TestPatterns (Join-Path $repoRoot "backend") @($backendPatterns) @(".py"))
$toolTests = @($toolTests | Sort-Object)
# `.mjs` is a frontend production extension (validation.json) and
# Select-ProductionPaths already treats `.test.mjs` / `.spec.mjs` as tests, so
# it has to be resolvable here too — otherwise such a test is excluded from the
# unmapped-production check AND impossible to select, i.e. silently unrunnable.
$frontendTestExtensions = @(".ts", ".tsx", ".js", ".jsx", ".mjs")
$frontendTests = @(
    Resolve-TestPatterns `
        (Join-Path $repoRoot "frontend") `
        @($frontendPatterns) `
        $frontendTestExtensions
)
$frontendE2E = @(
    Resolve-TestPatterns `
        (Join-Path $repoRoot "frontend") `
        @($e2ePatterns) `
        $frontendTestExtensions
)

foreach ($match in $matchedRules) {
    foreach ($pattern in $match.BackendPatterns) {
        if ((Resolve-TestPatterns (Join-Path $repoRoot "backend") @([string] $pattern) @(".py")).Count -eq 0) {
            throw "Backend mapping for '$($match.Sources -join ', ')' has no runnable match for '$pattern'."
        }
    }
    foreach ($pattern in @($match.FrontendPatterns) + @($match.E2EPatterns)) {
        if ((Resolve-TestPatterns (Join-Path $repoRoot "frontend") @([string] $pattern) @(".ts", ".tsx", ".js", ".jsx", ".mjs")).Count -eq 0) {
            throw "Frontend mapping for '$($match.Sources -join ', ')' has no runnable match for '$pattern'."
        }
    }
}

# A fallback selection may legitimately resolve to nothing -- a brand new
# directory has no colocated test yet. Only a configured mapping resolving to
# nothing is a misconfiguration worth stopping for.
if ($backendSourcePaths.Count -gt 0 -and $backendTests.Count -eq 0 -and -not $usedMappingFallback) {
    throw "Backend mappings resolved to zero runnable tests. Fix scripts/validation.json."
}
if ($frontendSourcePaths.Count -gt 0 -and ($frontendTests.Count + $frontendE2E.Count) -eq 0 -and -not $usedMappingFallback) {
    throw "Frontend mappings resolved to zero runnable tests. Fix scripts/validation.json."
}

$frontendE2E = @($frontendE2E | Where-Object { $_ -ne 'e2e/content-integration.spec.ts' })
if ($selectedOwner -ne 'All') {
    if ($selectedOwner -ne 'Backend') { $backendTests = @() }
    if ($selectedOwner -ne 'Frontend') { $frontendTests = @() }
    if ($selectedOwner -ne 'Tool') { $toolTests.Clear() }
    if ($selectedOwner -ne 'E2E') { $frontendE2E = @() }
}

Write-Host (
    "Selected $($toolTests.Count) tooling, " +
    "$($backendTests.Count) backend, " +
    "$($frontendTests.Count) frontend, and $($frontendE2E.Count) E2E test file(s)."
) -ForegroundColor Cyan

if ($PlanOnly) {
    Write-Host "`nComparison base: $baseRef (merge base $mergeBase)" -ForegroundColor Cyan
    Write-Host "Changed paths considered: $($allChangedPaths.Count); selected for this plan: $($changedPaths.Count)"
    if ($null -ne $retryState) {
        Write-Host "Retry record: status=$($retryState.status); pending owners=$(@($pendingOwners) -join ', ')"
    }
    if ($matchedRules.Count -eq 0) {
        Write-Host "Matched mappings: none (changed tests are selected directly)."
    }
    else {
        Write-Host "Matched mappings:"
        foreach ($match in $matchedRules) {
            $patterns = @($match.BackendPatterns) + @($match.FrontendPatterns) + @($match.E2EPatterns)
            $reason = if ($patterns -match '\*') { "broad wildcard mapping; inspect all listed consumers" } else { "direct mapping" }
            Write-Host " - $($match.Sources -join ', ') [$reason]"
            Write-Host "   changed: $($match.ChangedPaths -join ', ')"
            Write-Host "   tests: $($patterns -join ', ')"
        }
    }
    Write-Host "Resolved files: $($toolTests.Count) tooling, $($backendTests.Count) backend, $($frontendTests.Count) frontend, $($frontendE2E.Count) E2E."
    exit 0
}

if ($toolTests.Count -eq 0 -and $backendTests.Count -eq 0 -and $frontendTests.Count -eq 0 -and $frontendE2E.Count -eq 0) {
    Write-Host "No tests mapped for these non-production changes." -ForegroundColor Green
    exit 0
}

$ownersToRun = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if ($toolTests.Count -gt 0) { [void] $ownersToRun.Add("tool") }
if ($backendTests.Count -gt 0) { [void] $ownersToRun.Add("backend") }
if ($frontendTests.Count -gt 0) { [void] $ownersToRun.Add("frontend") }
if ($frontendE2E.Count -gt 0) { [void] $ownersToRun.Add("e2e") }

$completedOwners = if ($null -ne $retryState) { Get-StateValues $retryState.completedOwners } else { @() }
foreach ($owner in @($ownersToRun)) {
    $completedOwners = @($completedOwners | Where-Object { $_ -ne $owner })
}
$recordedPaths = @(@($requestedChangedPaths) + @($changedPaths) + @($retryState.changedPaths) | Where-Object { $_ } | Sort-Object -Unique)
$state = [ordered]@{
    schema = 2
    risk = $Risk
    owner = $selectedOwner
    baseRef = $baseRef
    mergeBase = $mergeBase
    status = "running"
    changedPaths = $recordedPaths
    pathDigests = Get-PathDigests $recordedPaths
    groups = [ordered]@{
        backend = @($backendTests)
        tool = @($toolTests)
        frontend = @($frontendTests)
        e2e = @($frontendE2E)
    }
    completedOwners = @($completedOwners | Sort-Object -Unique)
}
Write-TestState $state

try {
    if ($toolTests.Count -gt 0) {
        Invoke-Step "Affected tooling tests" {
            Push-Location $repoRoot
            try { & node --test @toolTests } finally { Pop-Location }
        }
        $completedOwners = @(@($completedOwners) + @("tool")) | Sort-Object -Unique
        Update-TestStateStatus $state "running" $completedOwners
    }
    if ($backendTests.Count -gt 0) {
    # Coverage is a whole-suite floor and is measured by CI, never by this
    # affected-subset selector.
        Invoke-Step "Affected backend tests" {
            Invoke-BackendPython -m pytest @backendTests -q --no-cov -x --tb=short
        }
        $completedOwners = @(@($completedOwners) + @("backend")) | Sort-Object -Unique
        Update-TestStateStatus $state "running" $completedOwners
    }
    if ($frontendTests.Count -gt 0) {
        Invoke-Step "Affected frontend tests" { Invoke-FrontendTests -Tests $frontendTests }
        $completedOwners = @(@($completedOwners) + @("frontend")) | Sort-Object -Unique
        Update-TestStateStatus $state "running" $completedOwners
    }
    if ($frontendE2E.Count -gt 0) {
        Invoke-Step "Affected frontend E2E" {
            Invoke-FrontendPnpm exec playwright test -x --config playwright.config.ts @frontendE2E
        }
        $completedOwners = @(@($completedOwners) + @("e2e")) | Sort-Object -Unique
        Update-TestStateStatus $state "running" $completedOwners
    }

    Update-TestStateStatus $state "succeeded" @(@($ownersToRun) + @($completedOwners))
    Write-Host "`nAffected tests passed." -ForegroundColor Green
}
catch {
    Update-TestStateStatus $state "failed" @($completedOwners)
    throw
}
}
finally {
    if ($null -ne $testLock) { $testLock.Dispose() }
}
