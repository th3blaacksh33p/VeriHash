@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "NATIVE_DIR=%ROOT_DIR%\src\native"
set "SERVER_SRC=%NATIVE_DIR%\server.c"
set "MONGOOSE_SRC=%NATIVE_DIR%\mongoose.c"
set "ASSETS_HEADER=%NATIVE_DIR%\embedded_assets.h"
set "OUT_DIR=%ROOT_DIR%\dist-native"
set "OUT_BIN=%OUT_DIR%\verihash.exe"

if not exist "%ASSETS_HEADER%" (
  echo Error: src\native\embedded_assets.h not found. Run "npm run build && npm run build:assets" first.
  exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

where cl >nul 2>nul
if %errorlevel%==0 (
  cl /nologo /O2 /W3 /I"%NATIVE_DIR%" /DVERIHASH_EMBEDDED_ASSETS=1 /Fe:"%OUT_BIN%" "%SERVER_SRC%" "%MONGOOSE_SRC%" ws2_32.lib
  if %errorlevel% neq 0 exit /b %errorlevel%
  echo Built native binary with MSVC: %OUT_BIN%
  exit /b 0
)

where gcc >nul 2>nul
if %errorlevel%==0 (
  gcc -std=gnu99 -O2 -Wall -Wextra -s -I"%NATIVE_DIR%" -DVERIHASH_EMBEDDED_ASSETS=1 "%SERVER_SRC%" "%MONGOOSE_SRC%" -o "%OUT_BIN%" -lws2_32
  if %errorlevel% neq 0 exit /b %errorlevel%
  echo Built native binary with GCC: %OUT_BIN%
  exit /b 0
)

where zig >nul 2>nul
if %errorlevel%==0 (
  zig cc -std=gnu99 -O2 -Wall -Wextra -s -I"%NATIVE_DIR%" -DVERIHASH_EMBEDDED_ASSETS=1 "%SERVER_SRC%" "%MONGOOSE_SRC%" -o "%OUT_BIN%" -lws2_32
  if %errorlevel% neq 0 exit /b %errorlevel%
  echo Built native binary with Zig CC: %OUT_BIN%
  exit /b 0
)

echo Error: No C compiler found (tried MSVC cl, MinGW gcc, zig cc).
exit /b 1
