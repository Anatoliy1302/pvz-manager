@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM Удаляет .env из всей истории Git и force-push в origin.
REM Требования: git, git-filter-repo (pip install git-filter-repo)
REM Использование: scripts\clean-env-history.bat [branch]
REM По умолчанию branch=master

set "BRANCH=%~1"
if "%BRANCH%"=="" set "BRANCH=master"

echo ==============================================
echo  Очистка .env из истории Git
echo ==============================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo Ошибка: git не найден в PATH.
  exit /b 1
)

where git-filter-repo >nul 2>&1
if errorlevel 1 (
  echo Ошибка: git-filter-repo не найден.
  echo Установите: pip install git-filter-repo
  exit /b 1
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "REPO_URL=%%R"
if "%REPO_URL%"=="" (
  echo Ошибка: remote origin не настроен.
  exit /b 1
)

set "TMP_DIR=%TEMP%\pvz-filter-repo-%RANDOM%"
set "CLONE_DIR=%TMP_DIR%\repo"

echo Remote: %REPO_URL%
echo Branch: %BRANCH%
echo Temp:   %TMP_DIR%
echo.
echo ВНИМАНИЕ: будет выполнен git push --force.
echo Убедитесь, что секреты из .env ротированы и команда предупреждена.
echo.
set /p CONFIRM="Продолжить? (yes/no): "
if /i not "%CONFIRM%"=="yes" (
  echo Отменено.
  exit /b 0
)

echo.
echo [1/4] Клонирование во временную папку...
mkdir "%TMP_DIR%" 2>nul
git clone --branch "%BRANCH%" "%REPO_URL%" "%CLONE_DIR%"
if errorlevel 1 (
  echo Ошибка клонирования. Проверьте branch и доступ к origin.
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)

pushd "%CLONE_DIR%"

git rev-list --all -- ".env" >nul 2>&1
if errorlevel 1 (
  echo Файл .env не найден в истории — очистка не требуется.
  popd
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 0
)

echo [2/4] git filter-repo --path .env --invert-paths ...
git filter-repo --path .env --invert-paths --force
if errorlevel 1 (
  echo Ошибка git filter-repo.
  popd
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)

echo [3/4] Проверка истории...
git rev-list --all -- ".env" >nul 2>&1
if not errorlevel 1 (
  echo Ошибка: .env всё ещё в истории.
  popd
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)
echo OK: .env удалён из истории.

echo [4/4] git push origin %BRANCH% --force
set /p PUSH_CONFIRM="Выполнить force push? (yes/no): "
if /i not "%PUSH_CONFIRM%"=="yes" (
  echo История переписана локально в: %CLONE_DIR%
  echo Для push: cd %CLONE_DIR% ^&^& git push origin %BRANCH% --force
  popd
  exit /b 0
)

git push origin "%BRANCH%" --force
if errorlevel 1 (
  echo Ошибка push.
  popd
  rmdir /s /q "%TMP_DIR%" 2>nul
  exit /b 1
)

popd
rmdir /s /q "%TMP_DIR%" 2>nul

echo.
echo Готово. Рекомендуется в основном клоне:
echo   git fetch origin
echo   git reset --hard origin/%BRANCH%

endlocal
