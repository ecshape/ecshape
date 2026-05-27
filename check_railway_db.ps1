# Railway Database Debugging Script
# Run this after: railway link (select Ecshape.org)

Write-Host "=== Railway Database Debugging ===" -ForegroundColor Cyan
Write-Host ""

# Check if linked
Write-Host "1. Checking Railway project link..." -ForegroundColor Yellow
railway status
Write-Host ""

# Check environment variables
Write-Host "2. Checking database environment variables..." -ForegroundColor Yellow
railway variables | Select-String -Pattern "DATABASE|POSTGRES|DB_|ENVIRONMENT"
Write-Host ""

# Check recent logs for database errors
Write-Host "3. Checking recent logs for database errors..." -ForegroundColor Yellow
railway logs | Select-String -Pattern "database|postgres|DATABASE|connection|error|Error|ERROR|CRITICAL" | Select-Object -Last 50
Write-Host ""

# Check service status
Write-Host "4. Checking service status..." -ForegroundColor Yellow
railway status
Write-Host ""

Write-Host "=== Next Steps ===" -ForegroundColor Green
Write-Host "1. Verify DATABASE_URL is set in Railway dashboard -> Variables"
Write-Host "2. Check PostgreSQL service is running and healthy"
Write-Host "3. Ensure services are linked in the same project"
Write-Host "4. Check if psycopg2-binary is in requirements.txt"
Write-Host "5. Review full logs: railway logs"

