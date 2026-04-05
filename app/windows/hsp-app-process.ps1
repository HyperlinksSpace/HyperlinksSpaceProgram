# Used by installer-hooks.nsi (nsExec::Exec, no console). Sync process names with package.json:
# build.productName, name (npm), product-brand portable slug, legacy "Hyperlinks Space App".
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Kill", "Test")]
  [string]$Action
)
$ErrorActionPreference = "SilentlyContinue"
$InstDir = $env:HSP_INSTDIR
if ([string]::IsNullOrWhiteSpace($InstDir)) {
  if ($Action -eq "Test") { exit 1 }
  exit 0
}

$names = @(
  "Hyperlinks Space Program",
  "Hyperlinks Space Program Helper",
  "Hyperlinks Space Program Helper (GPU)",
  "Hyperlinks Space Program Helper (Renderer)",
  "Hyperlinks Space Program Helper (Plugin)",
  "expo-template-default",
  "HyperlinksSpaceProgram",
  "Hyperlinks Space App"
)

function Get-Root([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return "" }
  return $p.TrimEnd("\").ToLower()
}
$root = Get-Root $InstDir
$rootContains = if ($root) { $root.ToLower() } else { "" }

function Test-AnyRunning {
  foreach ($n in $names) {
    if (Get-Process -Name $n -ErrorAction SilentlyContinue) { return $true }
  }
  if (-not $root) { return $false }
  $hit = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith($root)) -or
    ($_.CommandLine -and $rootContains -and $_.CommandLine.ToLower().Contains($rootContains))
  } | Select-Object -First 1
  return [bool]$hit
}

function Stop-All {
  foreach ($n in $names) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  if (-not $root) { return }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith($root)) -or
    ($_.CommandLine -and $rootContains -and $_.CommandLine.ToLower().Contains($rootContains))
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if ($Action -eq "Test") {
  if (Test-AnyRunning) { exit 0 } else { exit 1 }
}
Stop-All
Start-Sleep -Milliseconds 2000
exit 0
