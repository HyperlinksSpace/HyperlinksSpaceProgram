# Remove leftover per-user installs under %LOCALAPPDATA%\Programs\ and updater sidecars.
# Older builds often installed to AppData while current NSIS uses perMachine -> Program Files.
#
# Usage (from app/):
#   powershell -ExecutionPolicy Bypass -File .\windows\cleanup-legacy-appdata-installs.ps1          # list only
#   powershell -ExecutionPolicy Bypass -File .\windows\cleanup-legacy-appdata-installs.ps1 -Force   # delete
# If removal fails with "in use", close the app or run with -KillAppProcesses (stops exes under those folders).
#
param(
  [switch]$Force,
  [switch]$KillAppProcesses
)

$ErrorActionPreference = "Continue"

$legacyDirPatterns = @(
  "Hyperlinks Space App"
  "HyperlinksSpaceApp"
  "hyperlinks-space-app"
  "HyperlinksSpaceApp*"
)

function Test-LegacyDirName([string]$name) {
  foreach ($p in $legacyDirPatterns) {
    if ($p.EndsWith("*")) {
      $prefix = $p.TrimEnd("*")
      if ($name.StartsWith($prefix)) { return $true }
    } elseif ($name -eq $p) { return $true }
  }
  return $false
}

$candidates = @()
$programsRoot = "$env:LOCALAPPDATA\Programs"
if (Test-Path -LiteralPath $programsRoot) {
  Get-ChildItem -LiteralPath $programsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-LegacyDirName $_.Name) { $candidates += $_.FullName }
  }
}

$extra = @(
  "$env:LOCALAPPDATA\expo-template-default-updater"
  "$env:APPDATA\expo-template-default-updater"
) | Where-Object { Test-Path -LiteralPath $_ }

if ($candidates.Count -eq 0 -and $extra.Count -eq 0) {
  Write-Host "No legacy per-user folders under LOCALAPPDATA\Programs (or updater sidecars) found."
  exit 0
}

Write-Host "Legacy / AppData artifacts:"
$candidates | ForEach-Object { Write-Host "  [dir] $_" }
$extra | ForEach-Object { Write-Host "  [extra] $_" }

if (-not $Force) {
  Write-Host ""
  Write-Host "Re-run with -Force to delete these paths."
  exit 0
}

if ($KillAppProcesses -and $candidates.Count -gt 0) {
  foreach ($dir in $candidates) {
    $prefix = ($dir.TrimEnd("\")) + "\"
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and $_.Path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object {
      Write-Host "Stopping process: $($_.Name) ($($_.Path))"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 500
}

foreach ($p in $candidates) {
  try {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop
    Write-Host "Removed: $p"
  } catch {
    Write-Warning "Failed to remove $p : $_"
  }
}
foreach ($p in $extra) {
  try {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop
    Write-Host "Removed: $p"
  } catch {
    Write-Warning "Failed to remove $p : $_"
  }
}

Write-Host "Done."
