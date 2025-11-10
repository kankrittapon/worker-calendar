@echo off
REM Run all migrations for calendar_db (Windows)

echo Running migrations for calendar_db...

REM Check if --remote flag is provided
set REMOTE_FLAG=--local
if "%1"=="--remote" (
  echo Running on REMOTE database...
  set REMOTE_FLAG=--remote
) else (
  echo Running on LOCAL database...
)

echo.
echo [1/6] Running 001_init.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/001_init.sql
if errorlevel 1 goto error

echo [2/6] Running 002_attendance_audit.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/002_attendance_audit.sql
if errorlevel 1 goto error

echo [3/6] Running 003_add_notes.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/003_add_notes.sql
if errorlevel 1 goto error

echo [4/6] Running 004_sent_notifications.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/004_sent_notifications.sql
if errorlevel 1 goto error

echo [5/6] Running 005_add_display_name.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/005_add_display_name.sql
if errorlevel 1 goto error

echo [6/6] Running 006_notification_settings.sql...
wrangler d1 execute calendar_db %REMOTE_FLAG% --file=./migrations/006_notification_settings.sql
if errorlevel 1 goto error

echo.
echo ✅ All migrations completed successfully!
echo.
echo 📋 Verify with:
echo   wrangler d1 execute calendar_db %REMOTE_FLAG% --command="SELECT name FROM sqlite_master WHERE type='table'"
goto end

:error
echo.
echo ❌ Migration failed!
exit /b 1

:end
