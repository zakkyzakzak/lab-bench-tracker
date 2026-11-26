@echo off
rem Publish Lab Bench Tracker: push committed changes to GitHub (updates the
rem GitHub Pages copy) and deploy the site and Firestore rules to Firebase.
rem Usage:  .\publish.cmd
setlocal
cd /d "%~dp0"

for /f %%i in ('git status --porcelain') do (
  echo There are uncommitted changes. Commit them first, then run this again.
  git status --short
  exit /b 1
)

git push origin main || exit /b 1

rem GitHub Pages does not always start a build on push; ask for one explicitly.
gh api -X POST repos/zakkyzakzak/lab-bench-tracker/pages/builds >nul 2>&1

call firebase deploy --only hosting,firestore:rules --project lab-bench-tracker --non-interactive
if errorlevel 1 exit /b 1

rem The lab's Google Sheet script (apps-script\). Only when it has been connected once with
rem apps-script\connect.cmd, and only when its files changed since the last time they were sent.
if not exist apps-script\.clasp.json goto :done
set "ASH="
for /f %%h in ('git rev-parse HEAD:apps-script') do set "ASH=%%h"
set "OLD="
if exist apps-script\.pushed set /p OLD=<apps-script\.pushed
if "%ASH%"=="%OLD%" goto :done
echo Updating the Google Sheet script...
pushd apps-script
call npx --yes @google/clasp@3.4.1 push -f
if errorlevel 1 goto :scriptfail
if exist .deployment for /f "usebackq delims=" %%d in (".deployment") do call npx --yes @google/clasp@3.4.1 update-deployment %%d -d "Published from the tracker folder"
if errorlevel 1 goto :scriptfail
>.pushed echo %ASH%
popd
echo The Google Sheet script is up to date.
goto :done

:scriptfail
popd
echo.
echo The website was published, but the Google Sheet script was NOT updated.
echo If it says you are not logged in, run apps-script\connect.cmd again.
exit /b 1

:done
exit /b 0

