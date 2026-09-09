param(
    [string[]] $ChangedFiles = @(),
    [switch] $PlanOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "validation.json") -Raw |
    ConvertFrom-Json -AsHashtable
$statePath = Join-Path $repoRoot ".git/citeladder-test-state.json"

# Deliberately fixed. Agents may narrow a retry to files changed after a failed
# run, but may not redefine the repository comparison base.
$baseRef = "origin/main"

function Invoke-Step {
    param([string] $Name, [scriptblock] $Command)

    Write-Host "`n==> $Name" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE." }
}

function Read-TestState {
    if (-not (Test-Path -LiteralPath $statePath)) {
        throw "-ChangedFiles is only valid after an earlier test.ps1 run in this task."
    }
    try {
        return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }
    catch {
        throw "The previous test selection record is unreadable; rerun test.ps1 without -ChangedFiles."
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
            Invoke-FrontendPnpm exec vitest run @batchArguments
            $batch.Clear()
            $batchLength = 0
        }
        [void] $batch.Add($test)
        $batchLength += $test.Length + 1
    }
    if ($batch.Count -gt 0) {
        $batchArguments = @($batch)
        Invoke-FrontendPnpm exec vitest run @batchArguments
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

$mergeBase = Get-MergeBase
$allChangedPaths = @(Get-AllChangedPaths $mergeBase)
$retryState = if ($ChangedFiles.Count -gt 0) { Read-TestState } else { $null }
if ($null -ne $retryState) {
    if ($retryState.schema -ne 1) {
        throw "The previous test selection uses an unsupported state schema; rerun without -ChangedFiles."
    }
    if ([string] $retryState.baseRef -ne $baseRef) {
        throw "The previous test selection used base '$($retryState.baseRef)'; rerun without -ChangedFiles."
    }
    if ([string] $retryState.mergeBase -ne $mergeBase) {
        throw "The comparison merge base changed since the previous run; rerun test.ps1 without -ChangedFiles."
    }
    if ([string] $retryState.status -notin @("running", "failed", "succeeded")) {
        throw "The previous test selection has an invalid status; rerun without -ChangedFiles."
    }
}
$requestedChangedPaths = @(Select-RequestedChangedPaths $allChangedPaths $ChangedFiles)
if ($null -ne $retryState) {
    if ($null -eq $retryState.pathDigests) {
        throw "The previous test selection has no file digest record; rerun test.ps1 without -ChangedFiles."
    }
    $invalidatedPaths = @(Get-InvalidatedPaths $retryState $allChangedPaths)
    $requestedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $requestedChangedPaths) { [void] $requestedSet.Add($path) }
    $missingRetryPaths = @($invalidatedPaths | Where-Object { -not $requestedSet.Contains($_) })
    if ($missingRetryPaths.Count -gt 0) {
        $formatted = $missingRetryPaths -join ", "
        throw "Retry must include every path changed since the previous run: $formatted"
    }
}
$changedPaths = @($requestedChangedPaths)

if ($changedPaths.Count -eq 0) {
    Write-Host "No changed paths selected." -ForegroundColor Green
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

if ($null -ne $retryState -and $retryState.status -eq "succeeded") {
    throw "The previous test selection completed successfully; rerun test.ps1 without -ChangedFiles for a new diff."
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
if ($unmappedPaths.Count -gt 0) {
    $formatted = $unmappedPaths | Sort-Object | ForEach-Object { " - $_" }
    throw "Production files lack test mappings in scripts/validation.json:`n$($formatted -join "`n")"
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

if ($backendSourcePaths.Count -gt 0 -and $backendTests.Count -eq 0) {
    throw "Backend mappings resolved to zero runnable tests. Fix scripts/validation.json."
}
if ($frontendSourcePaths.Count -gt 0 -and ($frontendTests.Count + $frontendE2E.Count) -eq 0) {
    throw "Frontend mappings resolved to zero runnable tests. Fix scripts/validation.json."
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
$state = [ordered]@{
    schema = 1
    baseRef = $baseRef
    mergeBase = $mergeBase
    status = "running"
    changedPaths = @($allChangedPaths)
    pathDigests = Get-PathDigests $allChangedPaths
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
            Invoke-BackendPython -m pytest @backendTests -q --no-cov
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
            Invoke-FrontendPnpm exec playwright test --config playwright.config.ts @frontendE2E
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
