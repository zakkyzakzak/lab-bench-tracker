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
exit /b %ERRORLEVEL%
