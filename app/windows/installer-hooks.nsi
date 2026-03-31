; Minimal NSIS overrides:
; - force current-user install mode
; - terminate/check only current user's app process to avoid false "cannot be closed" prompts

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customCheckAppRunning
  !define SYSTEMROOT "$%SYSTEMROOT%"
  ; Best-effort stop currently running app process for current user only.
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c taskkill /F /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" >nul 2>&1'
  Pop $R1
  Sleep 1200

  ; Keep stock contract: $R0 = 0 if process still exists, non-zero otherwise.
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "${SYSTEMROOT}\System32\find.exe" "${PRODUCT_FILENAME}.exe"'
  Pop $R0
!macroend
