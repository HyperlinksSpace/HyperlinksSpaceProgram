; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - real-time DetailPrint + mirrored log file in %TEMP%
; - finish page shows full log in selectable read-only text area
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

Function HspEnsureInstallerLogPath
  StrCmp $HspLogFile "" hspSetLogPath hspLogPathDone
hspSetLogPath:
  StrCpy $HspLogFile "$TEMP\HyperlinksSpaceInstall.log"
  Delete "$HspLogFile"
hspLogPathDone:
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
  FindWindow $0 "#32770" "" $HWNDPARENT
  FindWindow $1 "msctls_progress32" "" $0
  IntCmp $1 0 hspInstFilesBarDone
  ShowWindow $1 ${SW_HIDE}
hspInstFilesBarDone:
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

Function HspFinishPageShow
!ifndef HSP_INSTALLER_AUTO_FINISH
  SetAutoClose false
!endif
  Call HspEnsureInstallerLogPath
  ; Launch app automatically when install reaches finish page; keep installer open for logs.
  StrCmp $HspDidLaunchApp "1" hspSkipAutoLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspSkipAutoLaunch:
  StrCpy $HspFinishLogEdit ""
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50201844, i 128, i 128, i 360, i 220, i $HWNDPARENT, i 0, i 0, i 0) i.r0"
  IntCmp $0 0 hspFinishShowDone
  StrCpy $HspFinishLogEdit $0
  StrCpy $9 $0
  System::Call "user32::SendMessageW(i r9, i 0xC5, i 16777216, i 0)"
  IfFileExists "$HspLogFile" hspFinishFillFile
  System::Call "user32::SetWindowTextW(i r9, w \"No installation log file was found.\")"
  Goto hspFinishShowDone
hspFinishFillFile:
  FileOpen $R0 "$HspLogFile" r
hspFinishReadLoop:
  FileRead $R0 $1
  IfErrors hspFinishFileDone
  System::Call "user32::SendMessageW(i r9, i 0x000E, i 0, i 0) i.r4"
  System::Call "user32::SendMessageW(i r9, i 0xB1, i r4, i r4)"
  StrCpy $2 "$1$\r$\n"
  System::Call "user32::SendMessageW(i r9, i 0xC2, i 1, w r2)"
  Goto hspFinishReadLoop
hspFinishFileDone:
  FileClose $R0
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
