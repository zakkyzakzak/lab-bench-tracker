@echo off
rem One-time: connect this folder to the lab's Google Sheet script, so that publish.cmd can
rem update the script without anything being pasted by hand.
rem Run it from PowerShell as:  .pps-script\connect.cmd
setlocal
cd /d "%~dp0"
echo.
echo Step 1 of 2. A browser window opens. Sign in as the Google account that owns the
echo Lab Bench Tracker mail sheet, and allow access.
echo.
call npx --yes @google/clasp@3.4.1 login
if errorlevel 1 (
  echo.
  echo Sign-in did not finish. Check that the Google Apps Script API is switched on at
  echo https://script.google.com/home/usersettings and run this again.
  exit /b 1
)
echo.
echo Step 2 of 2. In the script editor, open Project Settings ^(the cog^) and copy the Script ID.
set "SID="
set /p SID=Paste the Script ID here and press Enter: 
if "%SID%"=="" (
  echo No Script ID was given. Nothing was changed.
  exit /b 1
)
>.clasp.json echo {"scriptId":"%SID%"}
echo.
echo Connected. Tell Claude it is done: it will check the script against this folder
echo before anything is sent.
exit /b 0
