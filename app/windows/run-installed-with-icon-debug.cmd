@echo off
setlocal EnableExtensions
rem Launches the per-machine NSIS install with HSP_DEBUG_ICON=1 so main.log gets [icon:debug] lines.
rem Log file: %%APPDATA%%\expo-template-default\main.log (see package.json "name").
set "HSP_DEBUG_ICON=1"
set "ROOT=%ProgramFiles%\Hyperlinks Space Program"
if not exist "%ROOT%\" (
  echo [run-installed-with-icon-debug] Not found: "%ROOT%"
  exit /b 1
)
for %%N in ("Hyperlinks Space Program.exe" "Hyperlinks-Space-Program.exe" "HyperlinksSpaceProgram.exe") do (
  if exist "%ROOT%\%%~N" (
    echo [run-installed-with-icon-debug] Starting "%ROOT%\%%~N"
    start "" "%ROOT%\%%~N"
    exit /b 0
  )
)
echo [run-installed-with-icon-debug] No known exe in "%ROOT%":
dir /b "%ROOT%\*.exe" 2>nul
exit /b 1
