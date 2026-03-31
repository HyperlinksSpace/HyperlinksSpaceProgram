; Minimal NSIS overrides:
; - force current-user install mode (hide all-users path in practice)
; - auto-terminate running app process before stock check to avoid false "cannot be closed" loop

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customCheckAppRunning
  ; Best-effort stop currently running app process.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /F /IM "${PRODUCT_FILENAME}.exe" >nul 2>&1'
  Pop $R1
  Sleep 600

  ; Keep stock-style detection contract: $R0=0 when process still exists.
  nsExec::Exec '"$SYSDIR\cmd.exe" /c tasklist /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "$SYSDIR\find.exe" "${PRODUCT_FILENAME}.exe"'
  Pop $R0
!macroend
