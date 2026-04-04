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
; Custom phase-based progress (0–100): own msctls_progress32; stock bar stays hidden. See HspInstallProgressSet + extractAppPackage.nsh.

!include "FileFunc.nsh"
!include "WinMessages.nsh"
; Progress bar messages (not always in WinMessages.nsh)
!ifndef PBM_SETPOS
!define PBM_SETPOS 0x0402
!endif
!ifndef PBM_SETRANGE32
!define PBM_SETRANGE32 0x0461
!endif

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
Var HspCustomProgressHwnd

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

; $0 = inner dialog #32770, $1 = stock msctls_progress32 or 0 (used for layout when present).
; GetWindowRect fills $2–$5 via .r2–.r5 — NOT $R2–$R5 (different NSIS registers).
Function HspCreateCustomInstallProgress
  StrCmp $0 0 hspCreateProgEnd
  StrCmp $1 0 hspCreateProgUseDefault
  System::Alloc 16
  Pop $R9
  System::Call "user32::GetWindowRect(i r1, i r9)"
  System::Call "*$R9(&i4 .r2, &i4 .r3, &i4 .r4, &i4 .r5)"
  System::Alloc 8
  Pop $R8
  System::Call "*$R8(&i4 r2, &i4 r3)"
  System::Call "user32::ScreenToClient(i $0, i r8)"
  System::Call "*$R8(&i4 .r6, &i4 .r7)"
  IntOp $R8 $4 - $2
  IntOp $R9 $5 - $3
  Goto hspCreateProgDo
hspCreateProgUseDefault:
  StrCpy $6 20
  StrCpy $7 88
  StrCpy $R8 328
  StrCpy $R9 18
hspCreateProgDo:
  ; WS_CHILD | WS_VISIBLE | PBS_SMOOTH (0x01)
  System::Call "user32::CreateWindowExW(i 0, w \"msctls_progress32\", w \"\", i 0x50000001, i r6, i r7, i r8, i r9, i $0, i 0, i 0, i 0) i.r3"
  StrCpy $HspCustomProgressHwnd $3
  IntCmp $3 0 hspCreateProgEnd
  SendMessage $3 ${PBM_SETRANGE32} 0 100
  Push 5
  Call HspSetInstallProgress
hspCreateProgEnd:
FunctionEnd

; Stack: [return][percent]
Function HspSetInstallProgress
  Pop $R0
  Pop $R1
  Push $R0
  StrCmp $HspCustomProgressHwnd "" hspSetProgReturn
  IntCmp $R1 100 hspProgSend hspProgSend hspProgClampHi
hspProgClampHi:
  StrCpy $R1 100
hspProgSend:
  SendMessage $HspCustomProgressHwnd ${PBM_SETPOS} $R1 0
hspSetProgReturn:
FunctionEnd

Function HspInstFilesShow
  SetDetailsView show
  SetDetailsPrint both
  FindWindow $0 "#32770" "" $HWNDPARENT
  StrCmp $0 0 hspInstFilesBarDone
  FindWindow $1 "msctls_progress32" "" $0
  StrCmp $1 0 +2
  ShowWindow $1 ${SW_HIDE}
  Call HspCreateCustomInstallProgress
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

; Always defined so included scripts (e.g. extractAppPackage.nsh) compile for both installer and uninstaller builds.
!macro HspInstallProgressSet PCT
  !ifndef BUILD_UNINSTALLER
  Push ${PCT}
  Call HspSetInstallProgress
  !endif
!macroend

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
  !insertmacro HspInstallProgressSet 15
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
  ; customInit runs in .onInit before the InstFiles page — no custom progress bar yet (HspInstFilesShow creates it).
!macroend

!macro customInstall
  !insertmacro HspInstallProgressSet 95
  !insertmacro HspInstallDetailPrint "[installer] customInstall start"
  !insertmacro HspInstallDetailPrint "[installer] files copied, waiting for Finish page"
  ; Trigger launch as soon as install work is complete.
  StrCmp $HspDidLaunchApp "1" hspCustomInstallAfterLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspCustomInstallAfterLaunch:
  !insertmacro HspInstallDetailPrint "[installer] customInstall complete"
  !insertmacro HspInstallProgressSet 100
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
