# One-time cleanup: orphaned "Hyperlinks Space App" shortcuts (old product name; current is "Hyperlinks Space Program").
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File windows/cleanup-legacy-windows-shortcuts.ps1
# From repo app/:      powershell -ExecutionPolicy Bypass -File .\windows\cleanup-legacy-windows-shortcuts.ps1

$ErrorActionPreference = "Continue"
$legacy = "Hyperlinks Space App"

$roots = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
  [Environment]::GetFolderPath("Desktop"),
  "$env:PUBLIC\Desktop"
) | Where-Object { $_ -and (Test-Path $_) }

$removed = @()
foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -eq ".lnk" -and (
        $_.Name -like "*$legacy*" -or
        $_.DirectoryName -like "*$legacy*"
      )
    } |
    ForEach-Object {
      try {
        Remove-Item -LiteralPath $_.FullName -Force
        $removed += $_.FullName
      } catch {
        Write-Warning "Could not remove $($_.FullName): $_"
      }
    }
}

if ($removed.Count -eq 0) {
  Write-Host "No legacy shortcuts matching '$legacy' were found under Start Menu / Desktop."
} else {
  Write-Host "Removed $($removed.Count) item(s):"
  $removed | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "If 'Hyperlinks Space App' still appears under Settings -> Apps, uninstall it there,"
Write-Host "or run the current installer once (it also deletes legacy shortcuts in customInit)."
Write-Host ""
Write-Host "Old per-user installs may still exist under %LOCALAPPDATA%\Programs\. Run:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\windows\cleanup-legacy-appdata-installs.ps1 -Force"
