; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - real-time DetailPrint + mirrored log file in %TEMP%
; - finish page shows full log in selectable read-only text area
;
; Release: leave defined — dismiss wizard after finish page (see HspFinishPageShow / HspFinishPageLeave).
; Quit in the SHOW callback alone is unreliable (runs before nsDialogs::Show message loop). Do not omit
; MUI_FINISHPAGE_NOAUTOCLOSE for that: without it MUI can advance/close while the InstFiles progress bar is
; still catching up (wrong ESTIMATED_SIZE vs actual bytes), which looks like exit at ~60%.
; Debug: comment out — SetAutoClose false on the finish page; no Quit (copy logs, close manually).
!define HSP_INSTALLER_AUTO_FINISH

!include "FileFunc.nsh"
!include "WinMessages.nsh"

!ifdef BUILD_UNINSTALLER
!macro HspAppendInstallerLog TEXT
!macroend
!macro HspInstallDetailPrint MSG
!macroend
!endif

!ifndef BUILD_UNINSTALLER
; Required when customCheckAppRunning is defined: app-builder skips its own include (allowOnlyOneInstallerInstance.nsh).
!include "getProcessInfo.nsh"
Var pid
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
FunctionEnd

; Poll until ${APP_EXECUTABLE_FILENAME} is not listed by WMI (handles spaced names; no fixed delay on success).
; $R8 = iteration cap (~300 * 50ms max); uses $0 from ExecWait.
Function HspWaitUntilExeNotRunning
  StrCpy $R8 0
hspWaitExePoll:
  ; Exit 0 = process still present; exit 1 = no matching process (or findstr found no line).
  ExecWait `"$WINDIR\System32\cmd.exe" /C "wmic process where \"name='${APP_EXECUTABLE_FILENAME}'\" get ProcessId /value 2>nul | findstr /B ProcessId= >nul && exit /b 0 || exit /b 1"`
  IntCmp $0 0 hspWaitExeStill
  Return
hspWaitExeStill:
  IntOp $R8 $R8 + 1
  IntCmp $R8 300 0 0 hspWaitExeGiveUp
  Sleep 50
  Goto hspWaitExePoll
hspWaitExeGiveUp:
FunctionEnd

; Called before each CopyFiles from 7z-out to $INSTDIR (see windows/extractAppPackage.nsh retry loop).
Function HspKillBeforeCopy
  SetDetailsView show
  SetDetailsPrint both
  DetailPrint "[installer] unlock copy target (attempt $R1): taskkill /T ${APP_EXECUTABLE_FILENAME}"
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  Call HspWaitUntilExeNotRunning
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
  ; Quit here is often ignored (SHOW runs before nsDialogs::Show). Close via WM_CLOSE + PostQuitMessage.
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

; Only for the installer script. Uninstaller build defines BUILD_UNINSTALLER and does not include
; getProcessInfo.nsh here — if this macro existed, _CHECK_APP_RUNNING would expand ${GetProcessInfo} without the lib.
!ifndef BUILD_UNINSTALLER
!macro customCheckAppRunning
  ; Full _CHECK_APP_RUNNING (taskkill /im, retry loop). FIND_PROCESS uses IMAGENAME eq … which is unreliable
  ; when the exe name contains spaces, so the inner block can be skipped and nothing gets killed before CopyFiles.
  !insertmacro HspInstallDetailPrint "[installer] stop running processes (electron-builder + extra taskkill)"
  !insertmacro _CHECK_APP_RUNNING
  !insertmacro HspInstallDetailPrint "[installer] extra taskkill pass (spaced product name / stubborn locks)"
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  Call HspWaitUntilExeNotRunning
  nsExec::Exec `%SYSTEMROOT%\System32\cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R9
  Call HspWaitUntilExeNotRunning
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
  ; Always set: avoids MUI auto-jumping/closing while InstFiles progress is mid-bar (see header comment).
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
