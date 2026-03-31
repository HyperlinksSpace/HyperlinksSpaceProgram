; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - real-time DetailPrint + mirrored log file in %TEMP%
; - finish page shows full log in selectable read-only text area

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
  !insertmacro HspAppendInstallerLog "INSTALL_SUCCESS"
FunctionEnd

Function .onInstFailed
  !insertmacro HspAppendInstallerLog "INSTALL_FAILED"
FunctionEnd

Function HspInstFilesShow
  SetDetailsView show
  SetDetailsPrint both
FunctionEnd

Function HspFinishPageShow
  Call HspEnsureInstallerLogPath
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
FunctionEnd

Function HspFinishPageLeave
  StrCmp $HspFinishLogEdit "" +3
  StrCpy $0 $HspFinishLogEdit
  System::Call "user32::DestroyWindow(i r0)"
  StrCpy $HspFinishLogEdit ""
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

!macro customCheckAppRunning
  !define SYSTEMROOT "$%SYSTEMROOT%"
  !insertmacro HspInstallDetailPrint "[installer] attempting to stop running app process (current user)"
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c taskkill /F /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" >nul 2>&1'
  Pop $R1
  Sleep 1200
  nsExec::Exec '"${SYSTEMROOT}\System32\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "${SYSTEMROOT}\System32\find.exe" "${PRODUCT_FILENAME}.exe"'
  Pop $R0
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
  !insertmacro HspInstallDetailPrint "[installer] customInstall complete"
!macroend

!macro customFinishPage
  !ifndef BUILD_UNINSTALLER
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
    !define MUI_FINISHPAGE_RUN_CHECKED
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspFinishPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspFinishPageLeave
  !insertmacro MUI_PAGE_FINISH
  !endif
!macroend

!macro customUnInstall
  !insertmacro HspAppendInstallerLog "[uninstaller] start"
  !insertmacro HspAppendInstallerLog "[uninstaller] complete"
!macroend
