param(
    [int]$LauncherId,
    [long]$LauncherStartTicks,
    [string]$ProjectRoot,
    [int]$DatabaseId,
    [long]$DatabaseStartTicks
)

# Separate from the terminal so a window close can still shut PostgreSQL down cleanly.
$ErrorActionPreference = 'Stop'
try {
    $launcher = Get-Process -Id $LauncherId -ErrorAction SilentlyContinue
    if ($launcher -and $launcher.StartTime.ToUniversalTime().Ticks -eq $LauncherStartTicks) {
        $launcher.WaitForExit()
    }
    $database = Get-Process -Id $DatabaseId -ErrorAction SilentlyContinue
    if ($database -and $database.StartTime.ToUniversalTime().Ticks -eq $DatabaseStartTicks) {
        $pgCtl = Join-Path $ProjectRoot '.local\pg17\pgsql\bin\pg_ctl.exe'
        & $pgCtl -D (Join-Path $ProjectRoot '.local\pgdata17') -m fast -w stop
    }
} catch {
    $_ | Out-File -LiteralPath (Join-Path $ProjectRoot '.local\run-logs\database-shutdown-error.log') -Append
}
