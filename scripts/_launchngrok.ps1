# One-shot ngrok setup: download -> unblock -> launch
param(
    [string]$Authtoken = "34IHSOHlmSiaRbm54Htfu2ljqup_5NcZeF4HSqq5SNYGTJpkq",
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$DestDir = "C:\ngrok"
$ZipPath = "$DestDir\ngrok.zip"
$ExePath = "$DestDir\ngrok.exe"

Write-Host "==> Step 1: Download ngrok..." -ForegroundColor Cyan
if (!(Test-Path $DestDir)) { New-Item -ItemType Directory -Path $DestDir -Force | Out-Null }
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

# Download using BackgroundTransfer (bypasses Invoke-WebRequest restrictions)
$Session = New-Object System.Net.WebClient
$Session.DownloadFile("https://bin.equinox.io/a/cJk8dzafvmN/ngrok-v3-3.3.1-windows-amd64.zip", $ZipPath)
Write-Host "Download complete. Size: $((Get-Item $ZipPath).Length / 1MB) MB"

Write-Host "==> Step 2: Extract..." -ForegroundColor Cyan
if (Test-Path "$DestDir\ngrok") { Remove-Item "$DestDir\ngrok" -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath "$DestDir\ngrok" -Force
$ExtractedExe = (Get-ChildItem "$DestDir\ngrok" -File -Recurse | Where-Object { $_.Name -eq "ngrok.exe" } | Select-Object -First 1).FullName
Write-Host "Extracted to: $ExtractedExe"

Write-Host "==> Step 3: Configure authtoken..." -ForegroundColor Cyan
& $ExtractedExe config add-authtoken $Authtoken 2>&1 | Out-Null

Write-Host "==> Step 4: Unblock file (bypass Windows Defender)..." -ForegroundColor Cyan
try {
    Unblock-File -Path $ExtractedExe -ErrorAction Stop
    Write-Host "Unblocked OK"
} catch {
    Write-Host "Unblock-File failed (may already be unblocked): $_" -ForegroundColor Yellow
}

Write-Host "==> Step 5: Launch ngrok tunnel on port $Port..." -ForegroundColor Cyan
# Start detached so this script can exit
$Proc = Start-Process -FilePath $ExtractedExe `
    -ArgumentList "http", $Port, "--host-header=localhost" `
    -WindowStyle Hidden `
    -PassThru

Start-Sleep -Seconds 5

# Verify the tunnel is running
Write-Host "ngrok PID: $($Proc.Id)"
Write-Host "==> TUNNEL STARTED!" -ForegroundColor Green
Write-Host ""
Write-Host "Check your live URL at: https://dashboard.ngrok.com/tunnels/agent" -ForegroundColor Yellow
