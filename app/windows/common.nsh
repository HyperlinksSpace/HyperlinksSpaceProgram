; Shadow electron-builder templates/nsis/common.nsh (directories.buildResources is on !addincludedir
; before the template dir fallback, so this file wins for !include "common.nsh" from installer.nsi).
;
; Stock common.nsh line 5 is ShowInstDetails nevershow. That compiles CH_FLAGS_DETAILS_NEVERSHOW;
; NSIS exehead Ui.c InstProc WM_INITDIALOG then never ShowWindow's the InstFiles ListView (IDC_LIST1),
; so DetailPrint lines are invisible regardless of SetDetailsView at runtime.
;
; Include the stock branding and macros, then force details on so the assisted InstFiles page shows the log.
!include "../node_modules/app-builder-lib/templates/nsis/common.nsh"
ShowInstDetails show
