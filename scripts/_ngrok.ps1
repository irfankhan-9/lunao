# Download and extract ngrok
$ErrorActionPreference = 'Stop'
$ngrokZip = "$env:TEMP\ngrok.zip"
$ngrokDir = "$env:TEMP\ngrok"
$ngrokExe = "$ngrokDir\ngrok.exe"

Write-Host "Downloading ngrok..."
Invoke-WebRequest -Uri "https://bin.equinox.io/a/cJk8dzafvmN/ngrok-v3-3.3.1-windows-amd64.zip" -OutFile $ngrokZip -TimeoutSec 60

Write-Host "Extracting..."
if (Test-Path $ngrokDir) { Remove-Item $ngrokDir -Recurse -Force }
Expand-Archive -Path $ngrokZip -DestinationPath $ngrokDir -Force

Write-Host "Testing ngrok..."
& $ngrokExe version

Write-Host "Starting tunnel to localhost:8787..."
& $ngrokExe http 8787 --host-header=localhost
