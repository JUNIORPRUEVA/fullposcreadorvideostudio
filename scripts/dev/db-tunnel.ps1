# VS Code task entry point: "Studio: DB Tunnel".
# Makes sure the SSH forward required by DATABASE_URL (127.0.0.1:<port>) is up, then idles.
# It never runs migrations, seeds, resets or schema pushes.

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio DB]"

Write-StudioInfo $prefix "Checking the database tunnel required by apps/api/.env DATABASE_URL."

try {
  $result = Start-StudioDbTunnel -Root $root -Prefix $prefix
} catch {
  Write-StudioError $prefix $_.Exception.Message
  Write-StudioError $prefix "The API cannot reach its database without this tunnel. Nothing was changed in the database."
  exit 1
}

$report = $result.Report
Write-StudioInfo $prefix "Database provider: $($report.Provider) | host: $($report.Host):$($report.Port) | name: $($report.Name) | schema: $($report.Schema)"
Write-Host "STUDIO_DB_TUNNEL_READY"

if ($report.Port -gt 0) {
  $dbServer = if ($report.Host) { $report.Host } else { "127.0.0.1" }
  $dbPort = [int]$report.Port
  Wait-StudioServiceAlive -Label "the database endpoint ($dbServer`:$dbPort)" -Prefix $prefix -Probe { Test-StudioTcpPort -Server $dbServer -Port $dbPort }
} else {
  while ($true) { Start-Sleep -Seconds 3600 }
}
