# Remove broken "Hyperlinks Space App" entries from Uninstall registry so Settings no longer shows a ghost app
# with grayed-out Uninstall (usually UninstallString missing or points to deleted files).
#
# Run from elevated PowerShell if HKLM keys need removal:  Right-click PowerShell -> Run as administrator
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\windows\remove-orphan-uninstall-registry.ps1           # list only
#   powershell -ExecutionPolicy Bypass -File .\windows\remove-orphan-uninstall-registry.ps1 -Remove   # delete matching keys
#
param(
  [switch]$Remove
)

$ErrorActionPreference = "Continue"
$matchDisplay = "Hyperlinks Space App"

$roots = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
)

$found = @()
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
      $name = $p.DisplayName
      if (-not $name) { return }
      if ($name -notlike "*$matchDisplay*") { return }
      $un = $p.UninstallString
      $quiet = $p.QuietUninstallString
      $found += [pscustomobject]@{
        PsPath          = $_.PSPath
        DisplayName     = $name
        UninstallString = $un
        QuietUninstall  = $quiet
      }
    } catch {}
  }
}

if ($found.Count -eq 0) {
  Write-Host "No Uninstall registry entries with DisplayName matching '$matchDisplay' were found."
  exit 0
}

Write-Host "Matching registry keys:"
$found | Select-Object DisplayName, UninstallString, QuietUninstall, PsPath | Format-List

if (-not $Remove) {
  Write-Host ""
  Write-Host "To remove these keys (so the ghost app disappears from Settings), re-run with -Remove"
  exit 0
}

foreach ($row in $found) {
  try {
    Remove-Item -LiteralPath $row.PsPath -Recurse -Force
    Write-Host "Removed: $($row.PsPath)"
  } catch {
    Write-Warning "Could not remove $($row.PsPath) (try Administrator PowerShell for HKLM): $_"
  }
}

Write-Host "Done. If Settings still shows the app, restart it or sign out and back in."
