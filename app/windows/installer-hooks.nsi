; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - real-time DetailPrint + mirrored log file in %TEMP%
; - finish page: one multiline Edit for the log (no extra summary STATIC above it); load via SetWindowTextW
;
; HSP_INSTALLER_AUTO_FINISH — two finish-page setups (see commits 4f25a5c vs 160595ef):
;   • Defined   → auto-dismiss wizard after install (4f25a5c: no MUI_FINISHPAGE_NOAUTOCLOSE, Finish
;                button, then WM_CLOSE / Quit in HspFinishPage*).
;   • Commented → installer stays open for logs (160595ef: MUI_FINISHPAGE_NOAUTOCLOSE, no forced close).
; Uncomment the next line to enable auto-close:
;!define HSP_INSTALLER_AUTO_FINISH

; Extra exe name for older builds (do not use APP_EXECUTABLE_FILENAME here — not always defined by NSIS / CI).
!define HSP_ALT_MAIN_EXE "Hyperlinks Space Program.exe"

; Hiding the bar: MUI2 only allows MUI_INSTFILESPAGE_PROGRESSBAR = "" | colored | smooth — "disable" is invalid and breaks InstProgressFlags (NSIS 3 CI). Hide msctls_progress32 at runtime in HspInstFilesShow instead.

!include "FileFunc.nsh"
!include "WinMessages.nsh"

; user32::GetWindowLong indices (not all NSIS WinMessages bundles define these)
!define HSP_GWL_STYLE -16
!define HSP_GWL_EXSTYLE -20

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
Var HspInstFilesLogHwnd
Var HspInstFilesLogStyle
Var HspInstFilesLogExStyle
Var HspInstFilesLogSaveX
Var HspInstFilesLogSaveY
Var HspInstFilesLogSaveW
Var HspInstFilesLogSaveH

Function HspEnsureInstallerLogPath
  StrCmp $HspLogFile "" hspSetLogPath hspLogPathDone
hspSetLogPath:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceInstall.log"
  Delete "$HspLogFile"
hspLogPathDone:
FunctionEnd

; Finish page only: set log path if unset — never delete (avoids wiping the file before read).
Function HspFinishResolveLogPath
  StrCmp $HspLogFile "" hspFinLogSet
  Return
hspFinLogSet:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceInstall.log"
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
  Sleep 500
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

Function HspInstFilesShow
  SetDetailsView show
  SetDetailsPrint both
  StrCpy $HspInstFilesLogHwnd ""
  FindWindow $0 "#32770" "" $HWNDPARENT
  FindWindow $1 "msctls_progress32" "" $0
  IntCmp $1 0 hspInstFilesBarDone
  ShowWindow $1 ${SW_HIDE}
hspInstFilesBarDone:
  ; Outer wizard (IDD_INST in Contrib/UIs/modern*.rc): etched line *below* the header is control 1036.
  ; (1035 is the separate footer rule above branding; do not use it here.)
  GetDlgItem $1 $HWNDPARENT 1036
  IntCmp $1 0 hspInstFilesOuterLineDone
  ShowWindow $1 ${SW_HIDE}
hspInstFilesOuterLineDone:
  ; Inner InstFiles page (IDD_INSTFILES): one-line status (1006) duplicates DetailPrint; hide it.
  IntCmp $0 0 hspInstFilesInnerDone
  GetDlgItem $1 $0 1006
  IntCmp $1 0 hspInstFilesHideIntroDone
  ShowWindow $1 ${SW_HIDE}
hspInstFilesHideIntroDone:
  ; "Show details" (1027) still consumes a row; hide it so the log can use full inner height.
  GetDlgItem $1 $0 1027
  IntCmp $1 0 hspInstFilesHideShowDetailsDone
  ShowWindow $1 ${SW_HIDE}
hspInstFilesHideShowDetailsDone:
  ; SysListView32 (1016): top edge reads as a gray rule above the log; clear border + clientedge.
  GetDlgItem $1 $0 1016
  IntCmp $1 0 hspInstFilesInnerDone
  StrCpy $HspInstFilesLogHwnd $1
  ; Save placement (parent client coords) so Leave can restore after we expand to full inner client.
  System::Call "*(&i4 0 &i4 0 &i4 0 &i4 0) i.r6"
  System::Call "user32::GetWindowRect(i r1, i r6)"
  System::Call "*$6(&i4 .r2 &i4 .r3 &i4 .r4 &i4 .r5)"
  System::Call "*(&i4 r2 &i4 r3) i.r7"
  System::Call "user32::ScreenToClient(i r0, i r7)"
  System::Call "*$7(&i4 .r8 &i4 .r9)"
  StrCpy $HspInstFilesLogSaveX $8
  StrCpy $HspInstFilesLogSaveY $9
  IntOp $R8 $R4 - $R2
  IntOp $R9 $R5 - $R3
  StrCpy $HspInstFilesLogSaveW $R8
  StrCpy $HspInstFilesLogSaveH $R9
  System::Call "user32::GetWindowLong(i r1, i ${HSP_GWL_STYLE}) i .r2"
  StrCpy $HspInstFilesLogStyle $2
  System::Call "user32::GetWindowLong(i r1, i ${HSP_GWL_EXSTYLE}) i .r2"
  StrCpy $HspInstFilesLogExStyle $2
  IntOp $2 $HspInstFilesLogStyle & 0xFF7FFFFF
  IntOp $3 $HspInstFilesLogExStyle & 0xFFFFFDFF
  System::Call "user32::SetWindowLong(i r1, i ${HSP_GWL_STYLE}, i r2) i .r4"
  System::Call "user32::SetWindowLong(i r1, i ${HSP_GWL_EXSTYLE}, i r3) i .r4"
  System::Call "*(&i4 0 &i4 0 &i4 0 &i4 0) i.r6"
  System::Call "user32::GetClientRect(i r0, i r6)"
  System::Call "*$6(&i4 .r2 &i4 .r3 &i4 .r4 &i4 .r5)"
  IntOp $R7 $R4 - $R2
  IntOp $R8 $R5 - $R3
  System::Call "user32::SetWindowPos(i r1, i 0, i 0, i 0, i r7, i r8, i 0x0027) i .r4"
hspInstFilesInnerDone:
FunctionEnd

Function HspInstFilesLeave
  GetDlgItem $0 $HWNDPARENT 1036
  IntCmp $0 0 +2
  ShowWindow $0 ${SW_SHOW}
  FindWindow $0 "#32770" "" $HWNDPARENT
  IntCmp $0 0 hspInstFilesLeaveLogDone
  GetDlgItem $1 $0 1006
  IntCmp $1 0 hspInstFilesLeaveIntroDone
  ShowWindow $1 ${SW_SHOW}
hspInstFilesLeaveIntroDone:
  GetDlgItem $1 $0 1027
  IntCmp $1 0 hspInstFilesLeaveShowDetailsDone
  ShowWindow $1 ${SW_SHOW}
hspInstFilesLeaveShowDetailsDone:
  StrCmp $HspInstFilesLogHwnd "" hspInstFilesLeaveLogDone
  StrCpy $R8 $HspInstFilesLogHwnd
  StrCpy $R7 $HspInstFilesLogStyle
  StrCpy $R6 $HspInstFilesLogExStyle
  System::Call "user32::SetWindowLong(i r8, i ${HSP_GWL_STYLE}, i r7) i .r9"
  System::Call "user32::SetWindowLong(i r8, i ${HSP_GWL_EXSTYLE}, i r6) i .r9"
  StrCpy $R4 $HspInstFilesLogSaveX
  StrCpy $R5 $HspInstFilesLogSaveY
  StrCpy $R6 $HspInstFilesLogSaveW
  StrCpy $R7 $HspInstFilesLogSaveH
  System::Call "user32::MoveWindow(i r8, i r4, i r5, i r6, i r7, i 1) i .r9"
  StrCpy $HspInstFilesLogHwnd ""
hspInstFilesLeaveLogDone:
FunctionEnd

; $0 = 1 if any known main or Electron helper exe is still running, else 0.
; Uses one PowerShell check to avoid spawning many cmd/tasklist probes.
; Use PRODUCT_FILENAME / APP_PACKAGE_NAME only — APP_EXECUTABLE_FILENAME is not always passed to makensis.
Function HspAnyPackagedExeRunning
  nsExec::Exec `"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { $$names = @('${PRODUCT_FILENAME}.exe','${PRODUCT_FILENAME} Helper.exe','${PRODUCT_FILENAME} Helper (GPU).exe','${PRODUCT_FILENAME} Helper (Renderer).exe','${PRODUCT_FILENAME} Helper (Plugin).exe','${APP_PACKAGE_NAME}.exe','${HSP_ALT_MAIN_EXE}'); $$running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $$names -contains ($$_.ProcessName + '.exe') }; if ($$running) { exit 0 } else { exit 1 } }"`
  Pop $0
  IntCmp $0 0 hspAnyExeYes
  StrCpy $0 0
  Return
hspAnyExeYes:
  StrCpy $0 1
  Return
FunctionEnd

Function HspWaitUntilPackagedProcessesGone
  StrCpy $R8 0
hspWaitPackagedPoll:
  Call HspAnyPackagedExeRunning
  IntCmp $0 0 hspWaitPackagedDone
  IntOp $R8 $R8 + 1
  IntCmp $R8 400 0 0 hspWaitPackagedDone
  Sleep 50
  Goto hspWaitPackagedPoll
hspWaitPackagedDone:
FunctionEnd

Function HspKillPackagedAppProcesses
  ; Named exes (Electron main + helpers + legacy names). /F /T = force + child processes.
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME}.exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper.exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (GPU).exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (Renderer).exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (Plugin).exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${APP_PACKAGE_NAME}.exe" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${HSP_ALT_MAIN_EXE}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  ; Anything still running from $INSTDIR (crashpad, future helper renames, etc.). Same approach as app-builder _KILL_PROCESS via CIM.
  StrCpy $R7 "$INSTDIR"
  nsExec::Exec `"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& { $$inst = '$R7'; $$root = $$inst.ToLower(); Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.ToLower().StartsWith($$root) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }"`
  Pop $R9
FunctionEnd

; Called from windows/extractAppPackage.nsh before each CopyFiles (and each retry).
Function HspKillBeforeCopy
  SetDetailsView show
  SetDetailsPrint both
  DetailPrint "[installer] unlock install dir before copy (attempt $R1)"
  Call HspKillPackagedAppProcesses
  Call HspWaitUntilPackagedProcessesGone
FunctionEnd

; Drop trailing NSIS status line ("Completed") from log buffer in $R3.
Function HspFinishStripTrailingCompleted
  StrLen $R4 $R3
  IntCmp $R4 0 hspStripDone
  StrCpy $R5 "$\r$\nCompleted"
  StrLen $R6 $R5
  IntOp $R7 $R4 - $R6
  IntCmp $R7 0 hspStripTry hspStripDone hspStripTry
hspStripTry:
  StrCpy $R8 $R3 $R6 $R7
  StrCmp $R8 "$\r$\nCompleted" 0 hspStripBare
  StrCpy $R3 $R3 $R7 0
  Goto hspStripDone
hspStripBare:
  StrCmp $R3 "Completed" 0 hspStripDone
  StrCpy $R3 ""
hspStripDone:
FunctionEnd

Function HspFinishPageShow
!ifndef HSP_INSTALLER_AUTO_FINISH
  SetAutoClose false
!endif
  StrCpy $R1 $HWNDPARENT
  ; Hide MUI header title/subtitle (otherwise e.g. "Completed" / "Complete" from lang file).
  GetDlgItem $R0 $R1 1037
  IntCmp $R0 0 +2
  ShowWindow $R0 ${SW_HIDE}
  GetDlgItem $R0 $R1 1038
  IntCmp $R0 0 +2
  ShowWindow $R0 ${SW_HIDE}
  Call HspFinishResolveLogPath
  ; Launch app automatically when install reaches finish page; keep installer open for logs.
  StrCmp $HspDidLaunchApp "1" hspSkipAutoLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspSkipAutoLaunch:
  StrCpy $HspFinishLogEdit ""
  ; MUI finish = nsDialogs full-window page: inner #32770 holds bitmap + title + body labels.
  ; Hide the two labels under the bitmap, then place the edit in the same dialog-unit rect MUI uses (~120–315 x, 10–193 y).
  FindWindow $R2 "#32770" "" $HWNDPARENT
  IntCmp $R2 0 hspFinishEditOuterLayout
  System::Call "user32::GetWindow(i r2, i 4) i .r3"
  IntCmp $R3 0 hspFinishMapDlg
  System::Call "user32::GetWindow(i r3, i 2) i .r4"
  IntCmp $R4 0 hspFinishMapDlg
  ShowWindow $R4 ${SW_HIDE}
  System::Call "user32::GetWindow(i r4, i 2) i .r5"
  IntCmp $R5 0 hspFinishMapDlg
  ShowWindow $R5 ${SW_HIDE}
hspFinishMapDlg:
  StrCpy $8 $R2
  System::Call "*(&i4 120 &i4 10 &i4 315 &i4 193) i.r6"
  System::Call "user32::MapDialogRect(i r8, i r6)"
  System::Call "*$6(&i4 .r2 &i4 .r3 &i4 .r4 &i4 .r5)"
  IntOp $6 $4 - $2
  IntOp $7 $5 - $3
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50201844, i r2, i r3, i r6, i r7, i r8, i 0, i 0, i 0) i.r0"
  Goto hspFinishEditCreateDone
hspFinishEditOuterLayout:
  ; Fallback: outer IDC_CHILDRECT (installer pages that are not MUI full-window finish).
  GetDlgItem $R0 $R1 1018
  IntCmp $R0 0 hspFinishEditCreateFallback
  System::Call "*(&i4 0 &i4 0 &i4 0 &i4 0) i.r6"
  System::Call "user32::GetWindowRect(i r0, i r6)"
  System::Call "*$6(&i4 .r2 &i4 .r3 &i4 .r4 &i4 .r5)"
  System::Call "*(&i4 r2 &i4 r3) i.r7"
  System::Call "user32::ScreenToClient(i r1, i r7)"
  System::Call "*$7(&i4 .r8 &i4 .r9)"
  IntOp $6 $4 - $2
  IntOp $7 $5 - $3
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50201844, i r8, i r9, i r6, i r7, i r1, i 0, i 0, i 0) i.r0"
  Goto hspFinishEditCreateDone
hspFinishEditCreateFallback:
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50201844, i 16, i 48, i 300, i 200, i r1, i 0, i 0, i 0) i.r0"
hspFinishEditCreateDone:
  IntCmp $0 0 hspFinishShowDone
  StrCpy $HspFinishLogEdit $0
  StrCpy $9 $0
  System::Call "user32::SendMessageW(i r9, i 0xC5, i 16777216, i 0)"
  IfFileExists "$HspLogFile" hspFinishFillFile
  System::Call "user32::SetWindowTextW(i r9, w \"No installation log file was found.\")"
  Goto hspFinishAfterLogSet
hspFinishFillFile:
  ClearErrors
  FileOpen $R0 "$HspLogFile" r
  IfErrors hspFinishReadErr
  StrCpy $R3 ""
hspFinishReadLoop:
  FileRead $R0 $1
  IfErrors hspFinishFileDone
  StrCpy $R3 "$R3$1$\r$\n"
  StrLen $R4 $R3
  IntCmp $R4 7500 hspFinishFileDone hspFinishReadLoop hspFinishFileDone
hspFinishFileDone:
  FileClose $R0
  Call HspFinishStripTrailingCompleted
  System::Call "user32::SetWindowTextW(i r9, w r3)"
  Goto hspFinishAfterLogSet
hspFinishReadErr:
  System::Call "user32::SetWindowTextW(i r9, w \"Could not read installation log.\")"
hspFinishAfterLogSet:
  System::Call "user32::ShowWindow(i r9, i 5)"
hspFinishShowDone:
!ifdef HSP_INSTALLER_AUTO_FINISH
  ; Quit in SHOW alone is unreliable (runs before nsDialogs::Show message loop).
  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0
  System::Call "user32::PostQuitMessage(i 0)"
!endif
FunctionEnd

Function HspFinishPageLeave
  StrCmp $HspFinishLogEdit "" +3
  StrCpy $0 $HspFinishLogEdit
  System::Call "user32::DestroyWindow(i r0)"
  StrCpy $HspFinishLogEdit ""
!ifdef HSP_INSTALLER_AUTO_FINISH
  Quit
!endif
FunctionEnd
!endif

!macro customHeader
  Caption "${PRODUCT_NAME}"
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

!macro customPageAfterChangeDir
  ShowInstDetails show
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspInstFilesLeave
!macroend

!macro customInstallMode
  !insertmacro HspInstallDetailPrint "[installer] forcing current-user install mode"
  StrCpy $isForceCurrentInstall "1"
!macroend

; Installer only. Uninstaller defines BUILD_UNINSTALLER — Call must use un.* there; use stock _CHECK_APP_RUNNING.
!ifndef BUILD_UNINSTALLER
!macro customCheckAppRunning
  !insertmacro HspInstallDetailPrint "[installer] stop running app processes (tree kill + wait, all exe names)"
  Call HspKillPackagedAppProcesses
  Call HspWaitUntilPackagedProcessesGone
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
  ; MUI finish page body/title are MUI_FINISHPAGE_TITLE + MUI_FINISHPAGE_TEXT (nsDialogs labels), not SUBTITLE.
  !define MUI_FINISHPAGE_TITLE ""
  !define MUI_FINISHPAGE_TEXT ""
  !ifdef HSP_INSTALLER_AUTO_FINISH
    ; 4f25a5c: omit NOAUTOCLOSE (single-step to Finish; then we force-close in HspFinishPageShow/Leave).
    !define MUI_FINISHPAGE_BUTTON "Finish"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspFinishPageShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspFinishPageLeave
    !insertmacro MUI_PAGE_FINISH
  !else
    ; 160595ef: NOAUTOCLOSE keeps the wizard open until the user is done (log copy / manual close).
    !define MUI_FINISHPAGE_NOAUTOCLOSE
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspFinishPageShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspFinishPageLeave
    !insertmacro MUI_PAGE_FINISH
  !endif
  !endif
!macroend

!macro customUnInstall
  !insertmacro HspAppendInstallerLog "[uninstaller] start"
  !insertmacro HspAppendInstallerLog "[uninstaller] complete"
!macroend
