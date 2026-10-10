$ErrorActionPreference = 'Stop'
$ngrokZip = "$env:TEMP\ngrok2.zip"
$ngrokDir = "$env:TEMP\ngrok2"
$ngrokExe = "$ngrokDir\ngrok.exe"

Write-Host "Downloading ngrok 3.39.11..."
Invoke-WebRequest -Uri "https://bin.equinox.io/b/VkEWHDKGFtCM/ngrok-stable-windows-amd64.zip" -OutFile $ngrokZip -TimeoutSec 60

Write-Host "Extracting..."
if (Test-Path $ngrokDir) { Remove-Item $ngrokDir -Recurse -Force }
Expand-Archive -Path $ngrokZip -DestinationPath $ngrokDir -Force

Write-Host "ngrok version:"
& $ngrokExe version

Write-Host "Starting tunnel..."
& $ngrokExe http 8787 --host-header=localhost
