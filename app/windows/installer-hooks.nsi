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

; FileFunc.nsh before any macro that uses ${GetTime} (this include is merged ahead of installer.nsi).
; Encoding: electron-builder invokes makensis with -INPUTCHARSET UTF8 — keep this file UTF-8. Cyrillic in
; string literals: if a viewer/tool misreads the script, try UTF-8 with BOM; ASCII-only log lines avoid that.
!include "FileFunc.nsh"

; electron-builder defines BUILD_RESOURCES_DIR (absolute path to directories.buildResources). Push it onto
; the include stack here so common.nsh / installSection.nsh resolve from windows/ even if NSIS stdin/cwd
; search order would otherwise pick templates/nsis/*.nsh first.
!ifndef BUILD_RESOURCES_DIR
  !error "HSP NSIS: BUILD_RESOURCES_DIR missing (electron-builder should define it)."
!endif
!addincludedir "${BUILD_RESOURCES_DIR}"

; Timestamped lines in %TEMP%\HyperlinksSpaceUpdater.log (FileWrite — no NSIS logging build / LogSet).
; Uninstaller prebuild (BUILD_UNINSTALLER): Call may only target un.* functions; use Var un.* for log path.

; InstFiles log: (1) windows/common.nsh — ShowInstDetails show after stock common (compile-time).
; (2) Here — ShowInstDetails show again immediately before MUI_PAGE_INSTFILES (assistedInstaller.nsh).
; (3) HspInstFilesShow — on InstFiles SHOW: force listbox + listonly. NSIS SetDetailsPrint: listonly sends
;    status/DetailPrint lines into the white list; textonly uses only the single-line status bar (often
;    why "both" still leaves the list empty on MUI2). Wiki LogText/LogSet = file logging (special NSIS build).

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  ShowInstDetails show
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesShow
!macroend

Function HspInstFilesShow
  SetDetailsView show
  SetDetailsPrint listonly
FunctionEnd

Var HspLogFile
Function HspEnsureUpdaterLogPath
  StrCmp $HspLogFile "" hspSetLogPath hspLogPathDone
hspSetLogPath:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceUpdater.log"
hspLogPathDone:
FunctionEnd

!macro HspAppendUpdaterLog TEXT
  Call HspEnsureUpdaterLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  ; FileFunc GetTime (local): $R0=day $R1=month $R2=year $R3=weekday name (unused) $R4:$R5:$R6=time
  FileOpen $R9 "$HspLogFile" a
  FileWrite $R9 "[$R2-$R1-$R0 $R4:$R5:$R6] ${TEXT}$\r$\n"
  FileClose $R9
!macroend
!endif

!ifdef BUILD_UNINSTALLER
Var un.HspLogFile
Function un.HspEnsureUpdaterLogPath
  StrCmp $un.HspLogFile "" hspUnSetLogPath hspUnLogPathDone
hspUnSetLogPath:
  StrCpy $un.HspLogFile "$TEMP\HyperlinksSpaceUpdater.log"
hspUnLogPathDone:
FunctionEnd

!macro HspAppendUpdaterLog TEXT
  Call un.HspEnsureUpdaterLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  FileOpen $R9 "$un.HspLogFile" a
  FileWrite $R9 "[$R2-$R1-$R0 $R4:$R5:$R6] ${TEXT}$\r$\n"
  FileClose $R9
!macroend
!endif

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
; DetailPrint in .onInit runs before the InstFiles page exists (insthwnd not set) — lines do not appear
; in the Installing list; use HspAppendUpdaterLog or MessageBox for debug there if needed.
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
  ; Prefer listonly so lines target the InstFiles listbox once that page exists.
  SetDetailsPrint listonly
  SetDetailsView show
  DetailPrint "[installer] customInstallMode force current-user"
  !insertmacro HspAppendUpdaterLog "[installer] customInstallMode force current-user"
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  ; electron-builder calls this after other install steps; keep listbox output on for final hooks.
  SetDetailsPrint listonly
  SetDetailsView show
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
  SetDetailsPrint listonly
  SetDetailsView show
  DetailPrint "[uninstaller] customUnInstall start"
  !insertmacro HspAppendUpdaterLog "[uninstaller] customUnInstall start"
  DetailPrint "[uninstaller] customUnInstall complete"
  !insertmacro HspAppendUpdaterLog "[uninstaller] customUnInstall complete"
!macroend
