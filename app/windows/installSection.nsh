; Fork of app-builder-lib/templates/nsis/installSection.nsh (electron-builder).
; Only change: show installation details (SetDetailsPrint both) instead of none, plus
; versioned install layout under $INSTDIR\versions\<VERSION> and current junction.
;
; Source lives here (not app/build/). package.json sets directories.buildResources to
; "windows" so NSIS resolves this file before templates/nsis/installSection.nsh.
; Do not set build.nsis.script to a fork of installer.nsi: electron-builder then skips the
; uninstaller prebuild and never sets UNINSTALLER_OUT_FILE.

!include installer.nsh

InitPluginsDir

${IfNot} ${Silent}
  SetDetailsPrint both
  ; 7-Zip extraction does not stream filenames into the NSIS list (unlike File commands).
  ; Explicit DetailPrint lines are required for any visible log during install.
  DetailPrint "Step 1/10 - Preparing ${PRODUCT_NAME} ${VERSION}..."
${EndIf}

; Installed layout: $INSTDIR\versions\<VERSION>\* and $INSTDIR\current → junction to that folder.
; For upgrade checks, prefer an existing versioned or legacy flat exe.
${If} ${FileExists} "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
  StrCpy $appExe "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
${ElseIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
${Else}
  StrCpy $appExe "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
${EndIf}

# must be called before uninstallOldVersion
!insertmacro setLinkVars

${IfNot} ${Silent}
  DetailPrint "Step 2/10 - Checking that ${PRODUCT_NAME} is not running..."
${EndIf}

!ifdef ONE_CLICK
  !ifdef HEADER_ICO
    File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
  !endif
  ${IfNot} ${Silent}
    !ifdef HEADER_ICO
      SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
    !else
      SpiderBanner::Show /MODERN
    !endif

    FindWindow $0 "#32770" "" $hwndparent
    FindWindow $0 "#32770" "" $hwndparent $0
    GetDlgItem $0 $0 1000
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(installing)"

    StrCpy $1 $hwndparent
		System::Call 'user32::ShutdownBlockReasonCreate(${SYSTYPE_PTR}r1, w "$(installing)")'
  ${EndIf}
  !insertmacro CHECK_APP_RUNNING
!else
  ${ifNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING
  ${EndIf}
!endif

Var /GLOBAL keepShortcuts
StrCpy $keepShortcuts "false"
!insertMacro setIsTryToKeepShortcuts
${if} $isTryToKeepShortcuts == "true"
  ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts

  ${if} $R1 == "true"
  ${andIf} ${FileExists} "$appExe"
    StrCpy $keepShortcuts "true"
  ${endIf}
${EndIf}

${IfNot} ${Silent}
  DetailPrint "Step 3/10 - Checking for a previous installation and uninstalling the old build if needed..."
${EndIf}
!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
${endIf}

${IfNot} ${Silent}
  DetailPrint "Step 4/10 - Creating versioned install folder versions\${VERSION}..."
${EndIf}
CreateDirectory "$INSTDIR\versions"
SetOutPath "$INSTDIR\versions\${VERSION}"

!ifdef UNINSTALLER_ICON
  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
!endif

${IfNot} ${Silent}
  DetailPrint "Step 5/10 - Extracting application package with 7-Zip (longest step; file names are not listed)..."
${EndIf}
!insertmacro installApplicationFiles
${IfNot} ${Silent}
  DetailPrint "Step 6/10 - Extraction finished."
  DetailPrint "Step 7/10 - Pointing 'current' at versions\${VERSION} (directory junction)..."
${EndIf}
; Directory junction so shortcuts and the updater always use …\current\<exe>
IfFileExists "$INSTDIR\current" hspRemoveOldCurrent hspMklinkCurrent
hspRemoveOldCurrent:
  ${IfNot} ${Silent}
    DetailPrint "  (removing existing junction or folder: $INSTDIR\current)"
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\cmd.exe" /c rmdir "$INSTDIR\current"'
  Pop $R9
hspMklinkCurrent:
${IfNot} ${Silent}
  DetailPrint "  (creating junction: current -> versions\${VERSION})"
${EndIf}
nsExec::ExecToLog '"$SYSDIR\cmd.exe" /c mklink /J "$INSTDIR\current" "$INSTDIR\versions\${VERSION}"'
Pop $R9
StrCpy $appExe "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
${IfNot} ${Silent}
  DetailPrint "Step 8/10 - Writing install location and Add/Remove Programs registry entries..."
${EndIf}
!insertmacro registryAddInstallInfo
${IfNot} ${Silent}
  DetailPrint "Step 9/10 - Creating Start Menu and desktop shortcuts..."
${EndIf}
!insertmacro addStartMenuLink $keepShortcuts
!insertmacro addDesktopLink $keepShortcuts

${if} ${FileExists} "$newStartMenuLink"
  StrCpy $launchLink "$newStartMenuLink"
${else}
  StrCpy $launchLink "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
${endIf}

!ifmacrodef registerFileAssociations
  ${IfNot} ${Silent}
    DetailPrint "Registering file associations..."
  ${EndIf}
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
  ${IfNot} ${Silent}
    DetailPrint "Step 10/10 - Running final install hooks..."
  ${EndIf}
  !insertmacro customInstall
!endif

!macro doStartApp
  # otherwise app window will be in background
  HideWindow
  !insertmacro StartApp
!macroend

!ifdef ONE_CLICK
  # https://github.com/electron-userland/electron-builder/pull/3093#issuecomment-403734568
  !ifdef RUN_AFTER_FINISH
    ${ifNot} ${Silent}
    ${orIf} ${isForceRun}
      !insertmacro doStartApp
    ${endIf}
  !else
    ${if} ${isForceRun}
      !insertmacro doStartApp
    ${endIf}
  !endif
  !insertmacro quitSuccess
!else
  # for assisted installer run only if silent, because assisted installer has run after finish option
  ${if} ${isForceRun}
  ${andIf} ${Silent}
    !insertmacro doStartApp
  ${endIf}
!endif
