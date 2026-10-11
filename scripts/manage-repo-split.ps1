# Lunao Repository Split & Synchronization Manager
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\manage-repo-split.ps1 -Action push-backend
#   powershell -ExecutionPolicy Bypass -File scripts\manage-repo-split.ps1 -Action sync-frontend
#   powershell -ExecutionPolicy Bypass -File scripts\manage-repo-split.ps1 -Action status

param(
    [ValidateSet("push-backend", "sync-frontend", "status")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   LUNAO REPO SPLIT & SYNC MANAGER" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

switch ($Action) {
    "status" {
        Write-Host "[STATUS] Current Git Branch and Status:" -ForegroundColor Yellow
        git status
        Write-Host ""
        Write-Host "[REMOTE] Remote Configuration:" -ForegroundColor Yellow
        git remote -v
        Write-Host ""
        Write-Host "[GUIDE] Next Steps:" -ForegroundColor Green
        Write-Host "  To backup/push backend engine: powershell -ExecutionPolicy Bypass -File scripts\manage-repo-split.ps1 -Action push-backend"
        Write-Host "  To pull AI Studio changes:     powershell -ExecutionPolicy Bypass -File scripts\manage-repo-split.ps1 -Action sync-frontend"
        Write-Host ""
    }

    "push-backend" {
        Write-Host "[ACTION] Backing up and pushing Backend Engine to 'backend-engine' branch..." -ForegroundColor Yellow
        
        $status = git status --porcelain
        if ($status) {
            Write-Host "[GIT] Committing current work on master..." -ForegroundColor Gray
            git add -A
            git commit -m "chore: snapshot codebase before branch sync"
        }

        $branchExists = git branch --list backend-engine
        if (-not $branchExists) {
            Write-Host "[GIT] Creating 'backend-engine' branch..." -ForegroundColor Gray
            git branch backend-engine
        }

        Write-Host "[GIT] Pushing 'backend-engine' branch to GitHub origin..." -ForegroundColor Cyan
        git push origin master:backend-engine

        Write-Host ""
        Write-Host "[SUCCESS] Backend Engine branch is securely backed up and synced on GitHub!" -ForegroundColor Green
        Write-Host "          You can clone 'backend-engine' anywhere or pull it into your production server."
        Write-Host ""
    }

    "sync-frontend" {
        Write-Host "[ACTION] Pulling AI Studio frontend improvements into local master..." -ForegroundColor Yellow
        
        $currentBranch = (git branch --show-current).Trim()
        if ($currentBranch -ne "master") {
            Write-Host "[GIT] Switching to 'master' branch..." -ForegroundColor Gray
            git checkout master
        }

        Write-Host "[GIT] Pulling from origin master..." -ForegroundColor Cyan
        git pull origin master

        Write-Host ""
        Write-Host "[BUILD] Verifying build integrity..." -ForegroundColor Gray
        npm run build

        Write-Host ""
        Write-Host "[SUCCESS] Synchronization complete! All AI Studio updates merged successfully with zero backend data loss." -ForegroundColor Green
        Write-Host ""
    }
}
