# Quick script to restore fonts if OneDrive deletes them
Write-Host "Restoring fonts from git..." -ForegroundColor Yellow

# Restore fonts from git
git checkout HEAD -- Frontend/fonts/ 2>&1 | Out-Null
git checkout HEAD -- Frontend/public/fonts/ 2>&1 | Out-Null

# Verify fonts exist
$fontsExist = Test-Path "Frontend/fonts/Airbolt/ttf/airbolt-airbolt-regular-400.ttf"
$publicFontsExist = Test-Path "Frontend/public/fonts/airbolt.ttf"

if ($fontsExist -and $publicFontsExist) {
    Write-Host "✅ Fonts restored successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To prevent this from happening again:" -ForegroundColor Cyan
    Write-Host "1. Right-click Frontend/fonts/ folder" -ForegroundColor White
    Write-Host "2. Select 'Always keep on this device'" -ForegroundColor White
    Write-Host "3. Do the same for Frontend/public/fonts/" -ForegroundColor White
} else {
    Write-Host "❌ Some fonts are still missing. Check git status." -ForegroundColor Red
    git status Frontend/fonts/ Frontend/public/fonts/
}

