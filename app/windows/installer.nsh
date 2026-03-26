; Custom NSIS: window title only (no " Setup" suffix).
; Workaround for intermittent NSIS self-update/uninstall failures reported by
; multiple electron-builder users on some Windows machines.
CRCCheck off

!macro customHeader
  Caption "${PRODUCT_NAME}"
!macroend

; Do not override customCheckAppRunning: the default warns if the app is still running.
; An empty macro used to skip that check and led to "Failed to uninstall old application files"
; when the installer ran while Electron still had files open (e.g. after clicking an update toast).
