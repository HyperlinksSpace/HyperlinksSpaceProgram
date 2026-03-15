; Custom NSIS: window title only (no " Setup" suffix).
!macro customHeader
  Caption "${PRODUCT_NAME}"
!macroend

; Skip the "app is running, close it and retry" check so installation does not stop on that dialog.
; If the app is actually running and files are locked, the install may fail with a file-in-use error
; instead; close the app and run the installer again in that case.
!macro customCheckAppRunning
!macroend
