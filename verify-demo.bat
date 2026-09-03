@echo off
cd /d "%~dp0"

if not exist node_modules\typescript (
  echo [0/7] Installing typescript...
  call npm install
  if errorlevel 1 goto :fail
)

echo [1/7] Checking workspace schema...
node src\cli.ts ledger init
if errorlevel 1 goto :fail

echo.
echo [2/7] Running repository self tests...
node tests\run.ts
if errorlevel 1 goto :fail

echo.
echo [3/7] Building call graph...
node src\cli.ts test build-graph
if errorlevel 1 goto :fail

echo.
echo [4/7] Running impact tests...
node src\cli.ts test impact src\core\context.ts src\core\current.ts src\core\benchmarks.ts src\core\migration.ts src\core\packs.ts src\core\templates.ts src\core\workspace-schema.ts src\core\operation-log.ts src\core\benchmark-machine.ts src\core\work-item-machine.ts src\core\discussion.ts src\core\machine-events.ts src\core\projections.ts src\core\semantic-documents.ts
if errorlevel 1 goto :fail

echo.
echo [5/7] Running configured full test suite...
node src\cli.ts test run
if errorlevel 1 goto :fail

echo.
echo [6/7] Previewing context assembly...
node src\cli.ts ledger context
if errorlevel 1 goto :fail

echo.
echo [7/7] Checking ledger status...
node src\cli.ts ledger status
if errorlevel 1 goto :fail

echo.
echo Verification completed successfully.
goto :eof

:fail
echo.
echo Verification failed. Please send the error output above.
exit /b 1
