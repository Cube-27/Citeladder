[CmdletBinding()]
param(
    [switch] $All
)

$ErrorActionPreference = "Stop"
$scope = if ($All) { "All" } else { "Changed" }

& (Join-Path $PSScriptRoot "scripts/check.ps1") -Scope $scope
