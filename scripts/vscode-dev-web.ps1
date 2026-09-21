$ErrorActionPreference = "Stop"

$port = 3000
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($listener) {
  Write-Host "Ready in existing server http://localhost:$port"
  while ($true) {
    Start-Sleep -Seconds 3600
  }
}

npm run dev --workspace @fullpos-ad-studio/web
