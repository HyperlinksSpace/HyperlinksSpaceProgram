; NSIS hooks included by electron-builder (package.json build.nsis.include).
; Must NOT be named installer.nsh — that name shadows templates/nsis/include/installer.nsh when
; installSection.nsh does !include installer.nsh.
;
; Do not name this file installer.nsi when buildResources is the same folder (windows/): NSIS
; can resolve installer.nsi twice (explicit include + include path), duplicating macros.
; Do not set build.nsis.script to a fork of installer.nsi: electron-builder then skips the
; uninstaller prebuild and never defines UNINSTALLER_OUT_FILE.
;
; directories.buildResources must be "windows" so installSection.nsh overrides the stock one.
;
; Window title only (no " Setup" suffix).
; Workaround for intermittent NSIS self-update/uninstall failures reported by
; multiple electron-builder users on some Windows machines.
CRCCheck off

; assistedInstaller.nsh runs !ifmacrodef customPageAfterChangeDir immediately before MUI_PAGE_INSTFILES.
; Hook SHOW only (not PRE) so we do not override electron-builder's instFilesPre when
; allowToChangeInstallationDirectory is true. Runtime SetDetailsPrint fixes empty InstFiles log.
; Omit when BUILD_UNINSTALLER: the uninstaller pass has no installer InstFiles page; an unreferenced
; Function triggers NSIS warning 6010 and electron-builder fails (warnings as errors).
!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesShow
!macroend

Function HspInstFilesShow
  SetDetailsPrint both
  ; Short header so the list is never empty before installSection DetailPrint runs (ASCII only for NSIS Unicode builds).
  DetailPrint "Installation in progress - see steps below."
FunctionEnd
!endif

!macro HspAppendUpdaterLog TEXT
  FileOpen $0 "$TEMP\HyperlinksSpaceUpdater.log" a
  FileWrite $0 "${TEXT}$\r$\n"
  FileClose $0
!macroend

!macro customHeader
  Caption "${PRODUCT_NAME}"
  ; common.nsh forces nevershow; restore after so the InstFiles page can show a live log (like the updater).
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
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
  !insertmacro HspAppendUpdaterLog "[installer] customInit start"
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
  !insertmacro HspAppendUpdaterLog "[installer] customInit complete"
!macroend

!macro customInstallMode
  DetailPrint "[installer] customInstallMode force current-user"
  !insertmacro HspAppendUpdaterLog "[installer] customInstallMode force current-user"
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  DetailPrint "[installer] customInstall start"
  !insertmacro HspAppendUpdaterLog "[installer] customInstall start"
  SetOverwrite on
  ; Ensure the app is relaunched after install/update completes.
  IfFileExists "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 +2
  ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  DetailPrint "[installer] customInstall complete"
  !insertmacro HspAppendUpdaterLog "[installer] customInstall complete"
!macroend

!macro customUnInstall
  DetailPrint "[uninstaller] customUnInstall start"
  !insertmacro HspAppendUpdaterLog "[uninstaller] customUnInstall start"
  DetailPrint "[uninstaller] customUnInstall complete"
  !insertmacro HspAppendUpdaterLog "[uninstaller] customUnInstall complete"
!macroend
