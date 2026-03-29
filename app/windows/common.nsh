; Shadow electron-builder templates/nsis/common.nsh (directories.buildResources is on !addincludedir
; before the template dir fallback, so this file wins for !include "common.nsh" from installer.nsi).
;
; Stock common.nsh line 5 is ShowInstDetails nevershow. That compiles CH_FLAGS_DETAILS_NEVERSHOW;
; NSIS exehead Ui.c InstProc WM_INITDIALOG then never ShowWindow's the InstFiles ListView (IDC_LIST1).
;
; Include stock branding/macros via PROJECT_DIR (always defined by electron-builder NsisTarget) so the
; path does not depend on NSIS resolving ../node_modules relative to this file (differs by toolchain).
!ifdef PROJECT_DIR
  ; Forward slashes: avoid backslash-n in "\node_modules" being parsed oddly in some NSIS contexts.
  !include "${PROJECT_DIR}/node_modules/app-builder-lib/templates/nsis/common.nsh"
!else
  !include "../node_modules/app-builder-lib/templates/nsis/common.nsh"
!endif
; Last directive wins when MUI_* pages are expanded (installer.nsi order). Match electron-builder docs.
ShowInstDetails show
!ifdef BUILD_UNINSTALLER
  ShowUninstDetails show
!endif
