@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0\.."

git ls-files builds/ >nul 2>&1
if errorlevel 1 (
  echo builds/ не отслеживается в Git — ничего делать не нужно.
  exit /b 0
)

echo Файлы в builds/, отслеживаемые Git:
git ls-files builds/
echo.
set /p CONFIRM="Убрать из индекса (git rm --cached -r builds/)? (yes/no): "
if /i not "%CONFIRM%"=="yes" (
  echo Отменено.
  exit /b 0
)

git rm -r --cached builds/
echo.
echo Готово. Закоммитьте: git commit -m "chore: stop tracking builds/ APK artifacts"

endlocal
