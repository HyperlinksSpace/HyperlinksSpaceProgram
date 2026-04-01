; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - real-time DetailPrint + mirrored log file in %TEMP%
; - finish page shows full log in selectable read-only text area

!include "FileFunc.nsh"
!include "nsDialogs.nsh"

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
Var HspIsRefreshingLog

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
  Call HspEnsureInstallerLogPath
  ; Use the installation page itself as the copyable log surface.
  SetDetailsView hide
  SetDetailsPrint both
  StrCmp $HspFinishLogEdit "" +2
  Goto hspInstShowFocusOnly
  System::Call "user32::CreateWindowExW(i 0, w \"Edit\", w \"\", i 0x50B101C4, i 16, i 112, i 570, i 220, i $HWNDPARENT, i 0, i 0, i 0) i.r0"
  IntCmp $0 0 hspInstShowDone
  StrCpy $HspFinishLogEdit $0
hspInstShowFocusOnly:
  StrCpy $9 $HspFinishLogEdit
  System::Call "user32::SetWindowPos(i r9, i 0, i 0, i 0, i 0, i 0, i 0x0013)"
  System::Call "user32::SetFocus(i r9)"
  System::Call "user32::SendMessageW(i r9, i 0xC5, i 16777216, i 0)"
  Call HspLoadFinishLog
  GetFunctionAddress $8 HspRefreshFinishLogTimer
  nsDialogs::CreateTimer $8 300
hspInstShowDone:
FunctionEnd

Function HspInstFilesLeave
  GetFunctionAddress $8 HspRefreshFinishLogTimer
  nsDialogs::KillTimer $8
  StrCpy $HspIsRefreshingLog "0"
  StrCmp $HspFinishLogEdit "" +3
  StrCpy $0 $HspFinishLogEdit
  System::Call "user32::DestroyWindow(i r0)"
  StrCpy $HspFinishLogEdit ""
FunctionEnd

Function HspLoadFinishLog
  StrCmp $HspFinishLogEdit "" hspLoadFinishDone
  StrCpy $9 $HspFinishLogEdit
  ; Temporarily allow updates while rewriting text content.
  System::Call "user32::SendMessageW(i r9, i 0x00CF, i 0, i 0)"
  System::Call "user32::SetWindowTextW(i r9, w \"\")"
  IfFileExists "$HspLogFile" hspLoadFinishFile
  System::Call "user32::SetWindowTextW(i r9, w \"No installation log file was found.\")"
  Goto hspLoadFinishReadonly
hspLoadFinishFile:
  FileOpen $R0 "$HspLogFile" r
hspLoadFinishLoop:
  FileRead $R0 $1
  IfErrors hspLoadFinishFileDone
  System::Call "user32::SendMessageW(i r9, i 0x000E, i 0, i 0) i.r4"
  System::Call "user32::SendMessageW(i r9, i 0xB1, i r4, i r4)"
  StrCpy $2 "$1$\r$\n"
  System::Call "user32::SendMessageW(i r9, i 0xC2, i 1, w r2)"
  Goto hspLoadFinishLoop
hspLoadFinishFileDone:
  FileClose $R0
hspLoadFinishReadonly:
  ; Keep content non-editable while still selectable/copyable.
  System::Call "user32::SendMessageW(i r9, i 0x00CF, i 1, i 0)"
hspLoadFinishDone:
FunctionEnd

Function HspRefreshFinishLogTimer
  StrCmp $HspFinishLogEdit "" hspTimerDone
  StrCmp $HspIsRefreshingLog "1" hspTimerDone
  StrCpy $HspIsRefreshingLog "1"
  Call HspLoadFinishLog
  StrCpy $HspIsRefreshingLog "0"
hspTimerDone:
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
  ShowInstDetails nevershow
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspInstFilesLeave
!macroend

!macro customInstallMode
  !insertmacro HspInstallDetailPrint "[installer] forcing current-user install mode"
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customCheckAppRunning
  !define SYSTEMROOT "$%SYSTEMROOT%"
  !insertmacro HspInstallDetailPrint "[installer] attempting to stop running app processes (current user)"
  ; Different packaging paths may use different exe names, so terminate both candidates.
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c taskkill /F /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" >nul 2>&1'
  Pop $R1
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c taskkill /F /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_PACKAGE_NAME}.exe" >nul 2>&1'
  Pop $R2
  Sleep 1200
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "${SYSTEMROOT}\System32\find.exe" "${PRODUCT_FILENAME}.exe"'
  Pop $R0
  StrCmp $R0 "0" hspCheckPackageName
  Goto hspCheckDone
hspCheckPackageName:
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_PACKAGE_NAME}.exe" /FO csv | "${SYSTEMROOT}\System32\find.exe" "${APP_PACKAGE_NAME}.exe"'
  Pop $R0
hspCheckDone:
!macroend

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
  ; Keep default flow on installation page; no extra finish page.
!macroend

!macro customUnInstall
  !insertmacro HspAppendInstallerLog "[uninstaller] start"
  !insertmacro HspAppendInstallerLog "[uninstaller] complete"
!macroend
