; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - mirrored log file in %TEMP%
; - copyable multiline Edit on finish page only (custom child windows on instfiles break some NSIS/electron-builder builds)

!include "FileFunc.nsh"

!ifdef BUILD_UNINSTALLER
!macro HspAppendInstallerLog TEXT
!macroend
!macro HspInstallDetailPrint MSG
!macroend
!endif

!ifndef BUILD_UNINSTALLER
Var HspLogFile
Var HspLogHandle
Var HspFinishLogEdit
Var HspDidLaunchApp

; Wizard footer (Back / Next / Cancel) scope:
; - They are Win32 BUTTON controls on the *outer* NSIS dialog (class #32770, resource IDD_INST in Contrib/UIs/modern_*.exe).
; - Standard control IDs in that template: 1 = Next/Install, 2 = Cancel, 3 = Back (see NSIS InstFiles docs / multiUserUi.nsh GetDlgItem ... 1 for Next).
; - In MUI page callbacks, $HWNDPARENT is often an *inner* page pane; GetDlgItem($HWNDPARENT,1) can be 0, so nothing was hidden.
; - electron-builder does not expose a define to remove those controls; options are Win32 hide/disable (here), or forking NSIS templates.
Function HspHideWizardButtons
  ; GA_ROOT = 2 — top-level window that often owns control IDs 1–3 in one step.
  System::Call "user32::GetAncestor(i $HWNDPARENT, i 2) i.r6"
  GetDlgItem $R0 $R6 1
  IntCmp $R0 0 hspWalkParents hspApplyHide hspApplyHide
hspWalkParents:
  StrCpy $R6 $HWNDPARENT
  StrCpy $R5 0
hspFindShell:
  GetDlgItem $R0 $R6 1
  IntCmp $R0 0 hspShellNext hspApplyHide hspApplyHide
hspShellNext:
  System::Call "user32::GetParent(i r6) i.r7"
  IntCmp $R7 0 hspHideDone
  StrCpy $R6 $R7
  IntOp $R5 $R5 + 1
  IntCmp $R5 16 hspHideDone 0 hspFindShell
hspApplyHide:
  GetDlgItem $R0 $R6 1
  System::Call "user32::ShowWindow(i r0, i 0)"
  System::Call "user32::EnableWindow(i r0, i 0)"
  GetDlgItem $R0 $R6 2
  System::Call "user32::ShowWindow(i r0, i 0)"
  System::Call "user32::EnableWindow(i r0, i 0)"
  GetDlgItem $R0 $R6 3
  System::Call "user32::ShowWindow(i r0, i 0)"
  System::Call "user32::EnableWindow(i r0, i 0)"
  ; Synchronous repaint of the wizard shell (replaces a second hide pass + Sleep).
  System::Call "user32::InvalidateRect(i r6, i 0, i 1)"
  System::Call "user32::UpdateWindow(i r6)"
  Goto hspHideDone
hspHideDone:
FunctionEnd

Function HspInstFilesPageShow
  Call HspHideWizardButtons
FunctionEnd

Function HspEnsureInstallerLogPath
  StrCmp $HspLogFile "" hspSetLogPath hspLogPathDone
hspSetLogPath:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceInstall.log"
  Delete "$HspLogFile"
hspLogPathDone:
FunctionEnd

Function HspAppendInstDirToLog
  Call HspEnsureInstallerLogPath
  FileOpen $HspLogHandle "$HspLogFile" a
  FileWrite $HspLogHandle "INSTDIR="
  FileWrite $HspLogHandle $INSTDIR
  FileWrite $HspLogHandle "$\r$\n"
  FileClose $HspLogHandle
FunctionEnd

; Pass flag in $R9 — do not reference $IsPowerShellAvailable here (NSIS 6000: Var is declared before customCheckAppRunning runs).
Function HspAppendPowShellAvailToLog
  Call HspEnsureInstallerLogPath
  FileOpen $HspLogHandle "$HspLogFile" a
  FileWrite $HspLogHandle "IsPowerShellAvailable="
  FileWrite $HspLogHandle $R9
  FileWrite $HspLogHandle "$\r$\n"
  FileClose $HspLogHandle
FunctionEnd

!macro HspAppendInstallerLog TEXT
  Call HspEnsureInstallerLogPath
  ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
  StrCpy $R7 "[$R2-$R1-$R0 $R4:$R5:$R6] "
  FileOpen $HspLogHandle "$HspLogFile" a
  FileWrite $HspLogHandle $R7
  FileWrite $HspLogHandle "${TEXT}"
  FileWrite $HspLogHandle "$\r$\n"
  FileClose $HspLogHandle
!macroend

!macro HspInstallDetailPrint MSG
  SetDetailsView show
  SetDetailsPrint both
  DetailPrint "${MSG}"
  !insertmacro HspAppendInstallerLog "${MSG}"
!macroend

Function .onInstSuccess
  ; Primary launch trigger for all installer modes (including one-click/silent paths).
  ; Use one-shot guard so Finish-page fallback does not launch twice.
  StrCmp $HspDidLaunchApp "1" hspInstSuccessAfterLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspInstSuccessAfterLaunch:
  !insertmacro HspAppendInstallerLog "INSTALL_SUCCESS"
FunctionEnd

Function HspLaunchInstalledApp
  ; Keep Forge/electron-builder compatibility: avoid $launchLink (not always defined).
  IfFileExists "$INSTDIR\current\${PRODUCT_FILENAME}.exe" hspLaunchCurrent hspLaunchLegacy
hspLaunchCurrent:
  ExecShell "open" "$INSTDIR\current\${PRODUCT_FILENAME}.exe"
  !insertmacro HspAppendInstallerLog "APP_LAUNCH_TRIGGERED(current)"
  Return
hspLaunchLegacy:
  IfFileExists "$INSTDIR\${PRODUCT_FILENAME}.exe" hspLaunchLegacyDo hspLaunchFailed
hspLaunchLegacyDo:
  ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  !insertmacro HspAppendInstallerLog "APP_LAUNCH_TRIGGERED"
  Return
hspLaunchFailed:
  !insertmacro HspAppendInstallerLog "APP_LAUNCH_FAILED"
FunctionEnd

Function .onInstFailed
  !insertmacro HspAppendInstallerLog "INSTALL_FAILED"
FunctionEnd

; Load mirrored log file into the multiline Edit control (HWND in $HspFinishLogEdit).
Function HspLoadMirroredLogIntoEdit
  StrCmp $HspFinishLogEdit "" hspMirroredDone
  StrCpy $9 $HspFinishLogEdit
  System::Call "user32::SendMessageW(i r9, i 0x00CF, i 0, i 0)"
  System::Call "user32::SetWindowTextW(i r9, w \"\")"
  IfFileExists "$HspLogFile" hspMirroredFill
  System::Call "user32::SetWindowTextW(i r9, w \"No installation log file was found.\")"
  Goto hspMirroredReadonly
hspMirroredFill:
  FileOpen $R0 "$HspLogFile" r
hspMirroredLoop:
  FileRead $R0 $1
  IfErrors hspMirroredFileDone
  System::Call "user32::SendMessageW(i r9, i 0x000E, i 0, i 0) i.r4"
  System::Call "user32::SendMessageW(i r9, i 0xB1, i r4, i r4)"
  StrCpy $2 "$1$\r$\n"
  System::Call "user32::SendMessageW(i r9, i 0xC2, i 1, w r2)"
  Goto hspMirroredLoop
hspMirroredFileDone:
  FileClose $R0
hspMirroredReadonly:
  System::Call "user32::SendMessageW(i r9, i 0x00CF, i 1, i 0)"
hspMirroredDone:
FunctionEnd

Function HspFinishPageShow
  Call HspHideWizardButtons
  Call HspEnsureInstallerLogPath
  StrCmp $HspDidLaunchApp "1" hspSkipAutoLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspSkipAutoLaunch:
  StrCpy $HspFinishLogEdit ""
  StrCpy $R8 $HWNDPARENT
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50B101C4, i 128, i 128, i 360, i 220, i r8, i 0, i 0, i 0) i.r0"
  IntCmp $0 0 hspFinishShowDone
  StrCpy $HspFinishLogEdit $0
  StrCpy $9 $0
  System::Call "user32::SetFocus(i r9)"
  System::Call "user32::SendMessageW(i r9, i 0xC5, i 16777216, i 0)"
  Call HspLoadMirroredLogIntoEdit
hspFinishShowDone:
FunctionEnd

Function HspFinishPageLeave
  StrCmp $HspFinishLogEdit "" +3
  StrCpy $0 $HspFinishLogEdit
  System::Call "user32::DestroyWindow(i r0)"
  StrCpy $HspFinishLogEdit ""
FunctionEnd
!endif

!macro customHeader
  ; Default NSIS string is ^CopyDetails ("Copy Details To Clipboard"); use shorter label for the details list menu.
  LangString ^CopyDetails ${LANG_ENGLISH} "Copy logs"
  Caption "${PRODUCT_NAME}"
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

!macro customPageAfterChangeDir
  ShowInstDetails show
  ; Runs in assistedInstaller.nsh immediately before MUI_PAGE_INSTFILES — correct place for instfiles SHOW hook.
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesPageShow
!macroend

!macro customInstallMode
  !insertmacro HspInstallDetailPrint "[installer] forcing current-user install mode"
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
; When customCheckAppRunning is defined, app-builder skips its own getProcessInfo.nsh + Var pid — required by _CHECK_APP_RUNNING.
!include "getProcessInfo.nsh"
Var pid
Var /GLOBAL IsPowerShellAvailable

; Log + supplemental kill, then inline PS availability (same checks as app-builder allowOnlyOneInstallerInstance.nsh),
; then stock _CHECK_APP_RUNNING. The stock IS_POWERSHELL helper is not invoked by name (Forge stdin script order).
; PowerShell path: use $SYSDIR\...\powershell.exe (NSIS -WX warns on $PowerShellPath here).
!macro customCheckAppRunning
  !insertmacro HspInstallDetailPrint "[installer] CHECK_APP_RUNNING: start"
  DetailPrint "[installer] INSTDIR=$INSTDIR"
  Call HspAppendInstDirToLog
  !insertmacro HspInstallDetailPrint "[installer] APP_EXECUTABLE_FILENAME=${APP_EXECUTABLE_FILENAME} APP_PACKAGE_NAME=${APP_PACKAGE_NAME}.exe"
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill /F /IM (quoted exe names)"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $R0
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill primary exitcode=$R0 (128=no such process)"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /IM "${APP_PACKAGE_NAME}.exe"`
  Pop $R0
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill package-name exitcode=$R0"
  !insertmacro HspInstallDetailPrint "[installer] supplemental: PowerShell Stop-Process for any exe under INSTDIR"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $R0
  !insertmacro HspInstallDetailPrint "[installer] supplemental: PowerShell exitcode=$R0"
  !insertmacro HspInstallDetailPrint "[installer] detecting PowerShell (CIM + execution policy)"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`
  Pop $R1
  StrCmp $R1 0 hspPsCheckPolicy
  StrCpy $IsPowerShellAvailable 1
  Goto hspPsAvailDone
hspPsCheckPolicy:
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "if ((Get-ExecutionPolicy -Scope Process) -eq 'Restricted') { exit 1 } else { exit 0 }"`
  Pop $R1
  StrCmp $R1 0 hspPsAvailOk
  StrCpy $IsPowerShellAvailable 1
  Goto hspPsAvailDone
hspPsAvailOk:
  StrCpy $IsPowerShellAvailable 0
hspPsAvailDone:
  DetailPrint "[installer] IsPowerShellAvailable=$IsPowerShellAvailable (0=path-based find/kill)"
  StrCpy $R9 $IsPowerShellAvailable
  Call HspAppendPowShellAvailToLog
  !insertmacro _CHECK_APP_RUNNING
  !insertmacro HspInstallDetailPrint "[installer] CHECK_APP_RUNNING: end"
!macroend
!endif

!macro customInit
  !insertmacro HspInstallDetailPrint "[installer] customInit start"
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
  !insertmacro HspInstallDetailPrint "[installer] customInit complete"
!macroend

!macro customInstall
  !insertmacro HspInstallDetailPrint "[installer] customInstall start"
  !insertmacro HspInstallDetailPrint "[installer] files copied, waiting for Finish page"
  ; Trigger launch as soon as install work is complete.
  StrCmp $HspDidLaunchApp "1" hspCustomInstallAfterLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspCustomInstallAfterLaunch:
  !insertmacro HspInstallDetailPrint "[installer] customInstall complete"
!macroend

!macro customFinishPage
  !ifndef BUILD_UNINSTALLER
  ; Keep installer window open on completion for log inspection/copying.
  !define MUI_FINISHPAGE_NOAUTOCLOSE
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspFinishPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspFinishPageLeave
  !insertmacro MUI_PAGE_FINISH
  !endif
!macroend

!macro customUnInstall
  !insertmacro HspAppendInstallerLog "[uninstaller] start"
  !insertmacro HspAppendInstallerLog "[uninstaller] complete"
!macroend
