; Installer hooks for debug-friendly installs:
; - force current-user install mode
; - mirrored log file in %TEMP%
; - instfiles: primary button labeled "Finish" after install, LEAVE Quit (no separate MUI finish page)

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
Var HspDidLaunchApp
Var HspWizardShell

; Resolve outer MUI wizard HWND (same strategy as before). Used to retarget Back/Cancel, label primary "Finish", and Quit from instfiles.
Function HspResolveWizardShell
  StrCpy $HspWizardShell ""
  System::Call "user32::GetAncestor(i $HWNDPARENT, i 2) i.r6"
  GetDlgItem $R0 $R6 1
  IntCmp $R0 0 hspRSWalk hspRSDone hspRSDone
hspRSWalk:
  StrCpy $R6 $HWNDPARENT
  StrCpy $R5 0
hspRSLoop:
  GetDlgItem $R0 $R6 1
  IntCmp $R0 0 hspRSNext hspRSDone hspRSDone
hspRSNext:
  System::Call "user32::GetParent(i r6) i.r7"
  IntCmp $R7 0 hspRSDone
  StrCpy $R6 $R7
  IntOp $R5 $R5 + 1
  IntCmp $R5 16 hspRSDone 0 hspRSLoop
hspRSDone:
  StrCpy $HspWizardShell $R6
FunctionEnd

; Hide only Back (3) and Cancel (2); keep primary (1) so user can click through to Quit after install.
Function HspHideWizardBackCancel
  Call HspResolveWizardShell
  StrCmp $HspWizardShell "" hspHBCdone
  StrCpy $R8 $HspWizardShell
  GetDlgItem $R0 $R8 2
  System::Call "user32::ShowWindow(i r0, i 0)"
  System::Call "user32::EnableWindow(i r0, i 0)"
  GetDlgItem $R0 $R8 3
  System::Call "user32::ShowWindow(i r0, i 0)"
  System::Call "user32::EnableWindow(i r0, i 0)"
  System::Call "user32::InvalidateRect(i r8, i 0, i 1)"
  System::Call "user32::UpdateWindow(i r8)"
hspHBCdone:
FunctionEnd

; After install succeeds, primary still says "Next" until finish page — we skip finish page, so rename to "Finish" here.
Function HspSetPrimaryButtonFinish
  StrCmp $HspWizardShell "" hspFinDone
  StrCpy $R8 $HspWizardShell
  GetDlgItem $R0 $R8 1
  IntCmp $R0 0 hspFinDone
  System::Call 'user32::SetWindowTextW(i r0, w "Finish")'
  System::Call "user32::InvalidateRect(i r8, i 0, i 1)"
  System::Call "user32::UpdateWindow(i r8)"
hspFinDone:
FunctionEnd

Function HspInstFilesPageShow
  Call HspHideWizardBackCancel
FunctionEnd

; Skip separate MUI finish page: one click on "Finish" exits the installer (.onInstSuccess already ran).
Function HspInstFilesPageLeave
  Quit
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

; Win32_Process uses ExecutablePath (not Path). Set HSP_INSTDIR so the PowerShell -Command string stays free of NSIS $INSTDIR escaping issues.
Function HspSetInstDirEnvForPs
  System::Call 'kernel32::SetEnvironmentVariableW(w "HSP_INSTDIR", w "$INSTDIR")'
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
  Call HspSetPrimaryButtonFinish
  ; Primary launch trigger for all installer modes (including one-click/silent paths).
  ; Use one-shot guard so we do not launch twice (instfiles LEAVE Quit skips finish page).
  StrCmp $HspDidLaunchApp "1" hspInstSuccessAfterLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspInstSuccessAfterLaunch:
  !insertmacro HspAppendInstallerLog "INSTALL_SUCCESS"
  ; Silent installs: no instfiles button click — exit here (GUI uses HspInstFilesPageLeave Quit).
  IfSilent hspSilentExit hspGuiInstaller
hspGuiInstaller:
  Return
hspSilentExit:
  Quit
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
  ; Instfiles: hide Back/Cancel, then after install rename primary to "Finish"; LEAVE Quit skips extra finish page.
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW HspInstFilesPageShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HspInstFilesPageLeave
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
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill /F /T /IM (tree + quoted exe names)"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $R0
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill primary exitcode=$R0 (128=no such process)"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${APP_PACKAGE_NAME}.exe"`
  Pop $R0
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill package-name exitcode=$R0"
  ; Electron spawns separate helper executables (same folder); image name may not match APP_EXECUTABLE_FILENAME.
  !insertmacro HspInstallDetailPrint "[installer] supplemental: taskkill Electron helper image names"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper.exe"`
  Pop $R0
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (GPU).exe"`
  Pop $R0
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (Renderer).exe"`
  Pop $R0
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "${PRODUCT_FILENAME} Helper (Plugin).exe"`
  Pop $R0
  Call HspSetInstDirEnvForPs
  ; Strip \\?\ from WMI paths, canonicalize, enforce prefix boundary (avoid \\?\ mismatch + false C:\Foo vs C:\FooBar).
  !insertmacro HspInstallDetailPrint "[installer] supplemental: PowerShell Stop-Process (normalized INSTDIR + ExecutablePath / Path / MainModule)"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$d=$$env:HSP_INSTDIR; if(-not $$d){exit 0}; function N($$p){ if([string]::IsNullOrEmpty($$p)){return $$null}; $$p=$$p.Trim(); if($$p.StartsWith('\\?\')){$$p=$$p.Substring(4)}; if($$p.StartsWith('\??\')){$$p=$$p.Substring(4)}; try { return [System.IO.Path]::GetFullPath($$p).TrimEnd([char]92) } catch { return $$p.TrimEnd([char]92) } }; $$root=N $$d; if(-not $$root){exit 0}; function U($$f){ if([string]::IsNullOrEmpty($$f)){return $$false}; $$n=N $$f; if(-not $$n){return $$false}; if(-not $$n.StartsWith($$root,[System.StringComparison]::OrdinalIgnoreCase)){return $$false}; if($$n.Length -eq $$root.Length){return $$true}; return $$n[$$root.Length] -eq [char]92 }; Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { if(U $$_.ExecutablePath){ Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue } }; Get-Process -ErrorAction SilentlyContinue | ForEach-Object { try { $$fp=$$_.Path; if(-not $$fp){ $$fp=$$_.MainModule.FileName }; if(U $$fp){ Stop-Process -Id $$_.Id -Force -ErrorAction SilentlyContinue } } catch {} }; Start-Sleep -Milliseconds 1200"`
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
  !insertmacro HspInstallDetailPrint "[installer] files copied; use Finish on instfiles page to exit"
  ; Trigger launch as soon as install work is complete.
  StrCmp $HspDidLaunchApp "1" hspCustomInstallAfterLaunch
  StrCpy $HspDidLaunchApp "1"
  Call HspLaunchInstalledApp
hspCustomInstallAfterLaunch:
  !insertmacro HspInstallDetailPrint "[installer] customInstall complete"
!macroend

!macro customFinishPage
  ; No MUI_PAGE_FINISH: instfiles "Finish" + LEAVE Quit closes the wizard (see HspInstFilesPageLeave).
!macroend

!macro customUnInstall
  !insertmacro HspAppendInstallerLog "[uninstaller] start"
  !insertmacro HspAppendInstallerLog "[uninstaller] complete"
!macroend
