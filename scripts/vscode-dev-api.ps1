$ErrorActionPreference = "Stop"

$port = 4000
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($listener) {
  Write-Host "Video Studio API listening on http://localhost:$port"
  while ($true) {
    Start-Sleep -Seconds 3600
  }
}

npm run dev --workspace @fullpos-ad-studio/api
