@echo off

setlocal

cd /d "%~dp0"



echo ========================================

echo XZ Platform - Docker PostgreSQL Setup

echo ========================================

echo.



where docker >nul 2>&1

if errorlevel 1 (

  echo ERROR: Docker is not installed or not in PATH.

  echo Start Docker Desktop, then run this script again.

  exit /b 1

)



docker info >nul 2>&1

if errorlevel 1 (

  echo ERROR: Docker is not running.

  echo Start Docker Desktop and wait until it is ready, then rerun setup.bat

  exit /b 1

)



echo 1. Starting PostgreSQL in Docker...

docker compose up -d

if errorlevel 1 (

  echo ERROR: Failed to start PostgreSQL container.

  exit /b 1

)



echo.

echo 2. Waiting for PostgreSQL to be ready...

node scripts/waitForPostgres.js

if errorlevel 1 (

  echo ERROR: PostgreSQL did not start in time.

  exit /b 1

)



echo.

echo 3. Verifying credentials (auto-resets Docker volume if needed)...

node scripts/ensureDatabase.js

if errorlevel 1 (

  echo ERROR: Could not connect to PostgreSQL.

  exit /b 1

)



echo.

echo 4. Creating database tables...

node src/utils/setupDatabase.js

if errorlevel 1 (

  echo ERROR: Database setup failed.

  exit /b 1

)



echo.

echo 5. Final connection test...

node -e "import('./src/config/database.js').then(m => m.testConnection().then(ok => process.exit(ok ? 0 : 1)))"

if errorlevel 1 (

  echo ERROR: Final connection test failed.

  exit /b 1

)



echo.

echo ========================================

echo Setup complete!

echo PostgreSQL is running in Docker

echo ========================================

