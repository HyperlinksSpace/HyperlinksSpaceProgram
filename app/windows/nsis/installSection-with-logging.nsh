; Fork of app-builder-lib/templates/nsis/installSection.nsh (electron-builder).
; Only change: show installation details (file list / status) like the in-app updater log,
; instead of SetDetailsPrint none which hides all output.
;
; Must live under windows/nsis/ (not windows/) so !addincludedir does not shadow
; electron-builder's include/installer.nsh. The project hooks file must not be named
; installer.nsh (see windows/installer-custom.nsh).

!include installer.nsh

InitPluginsDir

${IfNot} ${Silent}
  SetDetailsPrint both
${endif}

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
  ${endif}
  !insertmacro CHECK_APP_RUNNING
!else
  ${ifNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING
  ${endif}
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
${endif}

!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
${endIf}

CreateDirectory "$INSTDIR\versions"
SetOutPath "$INSTDIR\versions\${VERSION}"

!ifdef UNINSTALLER_ICON
  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
!endif

!insertmacro installApplicationFiles
; Directory junction so shortcuts and the updater always use …\current\<exe>
IfFileExists "$INSTDIR\current" 0 +2
  ExecWait '"cmd.exe" /c if exist "$INSTDIR\current" rmdir "$INSTDIR\current"'
ExecWait '"cmd.exe" /c mklink /J "$INSTDIR\current" "$INSTDIR\versions\${VERSION}"'
StrCpy $appExe "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
!insertmacro registryAddInstallInfo
!insertmacro addStartMenuLink $keepShortcuts
!insertmacro addDesktopLink $keepShortcuts

${if} ${FileExists} "$newStartMenuLink"
  StrCpy $launchLink "$newStartMenuLink"
${else}
  StrCpy $launchLink "$INSTDIR\current\${APP_EXECUTABLE_FILENAME}"
${endIf}

!ifmacrodef registerFileAssociations
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
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
