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

; After all sections finish, NSIS often collapses the InstFiles list (text-only status). Re-open the list
; so the install log stays readable until the user clicks Next to the finish page.
Function .onInstSuccess
  SetDetailsView show
  SetDetailsPrint listonly
FunctionEnd

Var HspLogFile
Var HspLogHandle
Function HspEnsureUpdaterLogPath
  StrCmp $HspLogFile "" hspSetLogPath hspLogPathDone
hspSetLogPath:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceUpdater.log"
hspLogPathDone:
FunctionEnd

; Append in three writes: avoids one huge FileWrite string mixing $R0-$R6, colons, and runtime $VAR\path
; (NSIS recommends ${INSTDIR}\file when a path follows a variable; mixed literals have misparsed before).
!macro HspAppendUpdaterLog TEXT
  Call HspEnsureUpdaterLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  ; FileFunc GetTime (local): $R0=day $R1=month $R2=year $R3=weekday name (unused) $R4:$R5:$R6=time
  StrCpy $R7 "[$R2-$R1-$R0 $R4:$R5:$R6] "
  FileOpen $HspLogHandle "$HspLogFile" a
  FileWrite $HspLogHandle $R7
  FileWrite $HspLogHandle "${TEXT}"
  FileWrite $HspLogHandle "$\r$\n"
  FileClose $HspLogHandle
!macroend

; Re-assert list mode + mirror to HyperlinksSpaceUpdater.log (debug when MUI listbox stays empty).
!macro HspInstallDetailPrint MSG
  SetDetailsPrint listonly
  SetDetailsView show
  DetailPrint "${MSG}"
  !insertmacro HspAppendUpdaterLog "${MSG}"
!macroend

; Append one line to the temp log; message body must be in $R8 (timestamp added here). Used when the text includes runtime $variables.
Function HspAppendUpdaterLogVar
  Call HspEnsureUpdaterLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  StrCpy $R7 "[$R2-$R1-$R0 $R4:$R5:$R6] "
  FileOpen $HspLogHandle "$HspLogFile" a
  FileWrite $HspLogHandle $R7
  FileWrite $HspLogHandle $R8
  FileWrite $HspLogHandle "$\r$\n"
  FileClose $HspLogHandle
FunctionEnd

Var HspFinishLogEdit

; Child EDIT on the MUI finish page: stream the log file in with EM_REPLACESEL so the full file is shown (not limited by NSIS StrCpy size).
Function HspFinishPageShow
  StrCpy $HspFinishLogEdit ""
  Call HspEnsureUpdaterLogPath
  ; WS_CHILD|WS_VISIBLE|WS_VSCROLL|WS_BORDER|ES_MULTILINE|ES_AUTOVSCROLL|ES_READONLY|ES_WANTRETURN
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50201844, i 128, i 128, i 360, i 220, i $HWNDPARENT, i 0, i 0, i 0) i.r0"
  IntCmp $0 0 hspFinishShowDone
  StrCpy $HspFinishLogEdit $0
  StrCpy $9 $0
  ; EM_SETLIMITTEXT: raise default cap so large logs fit (WCHAR count).
  System::Call "user32::SendMessageW(i r9, i 0xC5, i 16777216, i 0)"
  IfFileExists "$HspLogFile" hspFinishFillFile
  System::Call "user32::SetWindowTextW(i r9, w \"No installation log file was found.\")"
  Goto hspFinishShowDone
  hspFinishFillFile:
  FileOpen $R0 "$HspLogFile" r
  hspFinishReadLoop:
    FileRead $R0 $1
    IfErrors hspFinishFileDone
    ; Move caret to end, then EM_REPLACESEL — lParam must be UTF-16 (use w r2, not t r2) or most inserts fail.
    System::Call "user32::SendMessageW(i r9, i 0x000E, i 0, i 0) i.r4"
    System::Call "user32::SendMessageW(i r9, i 0xB1, i r4, i r4)"
    StrCpy $2 "$1$\r$\n"
    System::Call "user32::SendMessageW(i r9, i 0xC2, i 1, w r2)"
    Goto hspFinishReadLoop
  hspFinishFileDone:
  FileClose $R0
  hspFinishShowDone:
FunctionEnd

Function HspFinishPageLeave
  ; +3 skips only the three destroy lines when there is no edit handle.
  StrCmp $HspFinishLogEdit "" +3
  StrCpy $0 $HspFinishLogEdit
  System::Call "user32::DestroyWindow(i r0)"
  StrCpy $HspFinishLogEdit ""
  ; App is started from customInstall with SW_SHOWNOACTIVATE so it does not steal focus from this Finish page.
FunctionEnd

; Replaces stock assistedInstaller.nsh finish block: optional Run + MUI_PAGE_FINISH with log viewer.
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspFinishPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspFinishPageLeave
  !insertmacro MUI_PAGE_FINISH
!macroend
!endif

!ifdef BUILD_UNINSTALLER
Var un.HspLogFile
Var un.HspLogHandle
Function un.HspEnsureUpdaterLogPath
  StrCmp $un.HspLogFile "" hspUnSetLogPath hspUnLogPathDone
hspUnSetLogPath:
  StrCpy $un.HspLogFile "$TEMP\HyperlinksSpaceUpdater.log"
hspUnLogPathDone:
FunctionEnd

!macro HspAppendUpdaterLog TEXT
  Call un.HspEnsureUpdaterLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  StrCpy $R7 "[$R2-$R1-$R0 $R4:$R5:$R6] "
  FileOpen $un.HspLogHandle "$un.HspLogFile" a
  FileWrite $un.HspLogHandle $R7
  FileWrite $un.HspLogHandle "${TEXT}"
  FileWrite $un.HspLogHandle "$\r$\n"
  FileClose $un.HspLogHandle
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

; NSIS 3.0.x ExecShell only accepts SW_SHOW* names, not a numeric nShowCmd — use ShellExecuteW for SW_SHOWNOACTIVATE (4).
Function HspShellOpenExeNoActivate
  System::Call "shell32::ShellExecuteW(i 0, w \"open\", w \"$INSTDIR\${PRODUCT_FILENAME}.exe\", w \"\", w \"$INSTDIR\", i 4) i.r0"
FunctionEnd

!macro customInstall
  ; electron-builder calls this after other install steps; keep listbox output on for final hooks.
  SetDetailsPrint listonly
  SetDetailsView show
  DetailPrint "[installer] customInstall start"
  !insertmacro HspAppendUpdaterLog "[installer] customInstall start"
  SetOverwrite on
  ; Start the app as soon as files are installed; nShowCmd 4 = SW_SHOWNOACTIVATE (avoid stealing focus from Finish page).
  IfFileExists "$INSTDIR\${PRODUCT_FILENAME}.exe" 0 hspCustomInstallSkipLaunch
  Call HspShellOpenExeNoActivate
  hspCustomInstallSkipLaunch:
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
