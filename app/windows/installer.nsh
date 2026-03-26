; Custom NSIS: window title only (no " Setup" suffix).
; Workaround for intermittent NSIS self-update/uninstall failures reported by
; multiple electron-builder users on some Windows machines.
CRCCheck off
ShowInstDetails show
ShowUnInstDetails show

!macro _TraceLog TEXT
  FileOpen $0 "$TEMP\HyperlinksSpaceUpdater.log" a
  FileWrite $0 "${TEXT}$\r$\n"
  FileClose $0
!macroend

!macro customHeader
  Caption "${PRODUCT_NAME}"
!macroend

; Override process check to use quoted SYSTEMROOT-based tool paths.
; This matches a community workaround for path handling inconsistencies.
!macro customCheckAppRunning
  !define SYSTEMROOT "$%SYSTEMROOT%"
  ; electron-builder defines PRODUCT_FILENAME (process image name without ".exe").
  ; Use it instead of the undefined electron-builder internal file var.
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "${SYSTEMROOT}\System32\find.exe" "${PRODUCT_FILENAME}.exe"'
  Pop $R0
!macroend

; One-time migration workaround for installations stuck in uninstall error state (: 2).
; Keeps install in current-user mode and bypasses stale uninstall command strings.
!macro customInit
  DetailPrint "[installer] customInit start"
  !insertmacro _TraceLog "[installer] customInit start"
  SetRegView 64
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  SetRegView 32
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  DetailPrint "[installer] customInit complete"
  !insertmacro _TraceLog "[installer] customInit complete"
!macroend

!macro customInstallMode
  DetailPrint "[installer] customInstallMode force current-user"
  !insertmacro _TraceLog "[installer] customInstallMode force current-user"
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  DetailPrint "[installer] customInstall start"
  !insertmacro _TraceLog "[installer] customInstall start"
  AutoCloseWindow true
  SetOverwrite on
  DetailPrint "[installer] customInstall complete"
  !insertmacro _TraceLog "[installer] customInstall complete"
!macroend

!macro customUnInstall
  DetailPrint "[uninstaller] customUnInstall start"
  !insertmacro _TraceLog "[uninstaller] customUnInstall start"
  AutoCloseWindow true
  DetailPrint "[uninstaller] customUnInstall complete"
  !insertmacro _TraceLog "[uninstaller] customUnInstall complete"
!macroend
