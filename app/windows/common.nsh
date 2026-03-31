; installer.nsi uses !include "common.nsh" — this filename must stay. Body is hsp-electron-common.nsh,
; vendored from app-builder-lib templates/nsis/common.nsh and kept close to stock behavior.
; When upgrading electron-builder, diff templates/nsis/common.nsh against hsp-electron-common.nsh.
!include "hsp-electron-common.nsh"
