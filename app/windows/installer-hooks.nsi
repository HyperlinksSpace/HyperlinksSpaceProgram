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

; InstFiles log visibility: fixed at compile time via windows/common.nsh shadowing stock common.nsh
; (ShowInstDetails show after Include). Wiki LogText/LogSet macros are file logging and need an NSIS
; special build; on-screen lines use DetailPrint + ShowInstDetails.

!macro HspAppendUpdaterLog TEXT
  FileOpen $0 "$TEMP\HyperlinksSpaceUpdater.log" a
  FileWrite $0 "${TEXT}$\r$\n"
  FileClose $0
!macroend

!macro customHeader
  Caption "${PRODUCT_NAME}"
  ; Belt-and-suspenders if an older common.nsh without the shadow is ever used.
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
