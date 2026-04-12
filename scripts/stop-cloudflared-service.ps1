# Stops the Windows service "Cloudflared" (cloudflared agent) and retries until the process exits.
# Requires elevation. Usage: powershell -ExecutionPolicy Bypass -File .\scripts\stop-cloudflared-service.ps1

$serviceName = 'Cloudflared'
$maxAttempts = 45
$sleepSec = 1

function Test-Administrator {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = [Security.Principal.WindowsPrincipal]::new($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    $path = $PSCommandPath
    if (-not $path) { throw 'Run with: powershell -File scripts\stop-cloudflared-service.ps1' }
    Write-Host 'Elevation required. Approve the UAC prompt; the window will wait until the service stops.'
    $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $path
    )
    exit $p.ExitCode
}

$ErrorActionPreference = 'Continue'

for ($i = 1; $i -le $maxAttempts; $i++) {
    $proc = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "SUCCESS: cloudflared process is gone (after attempt $i)."
        $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($svc) { Write-Host "Service status: $($svc.Status)" }
        exit 0
    }

    $ids = @($proc) | ForEach-Object { $_.Id }
    Write-Host "Attempt $i/${maxAttempts}: stopping cloudflared (PID $($ids -join ', '))..."

    try { Stop-Service -Name $serviceName -Force -ErrorAction Stop } catch {
        Write-Host ("  Stop-Service: {0}" -f $_.Exception.Message)
    }
    $null = & sc.exe stop $serviceName 2>&1

    Start-Sleep -Seconds $sleepSec

    $proc = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($proc) {
        foreach ($p in @($proc)) {
            $null = & taskkill.exe /PID $p.Id /F 2>&1
        }
        Start-Sleep -Seconds $sleepSec
    }
}

Write-Error 'FAILED: cloudflared still running after maximum attempts.'
exit 1
