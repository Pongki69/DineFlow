param([switch]$SmokeTest)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$logs = Join-Path $root '.local\run-logs'
$children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$databaseStarted = $false
$locked = $false
$exitCode = 0
$processGroup = $null
$hash = [System.Security.Cryptography.SHA256]::Create()
$id = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-', '')
$hash.Dispose()
$mutex = [Threading.Mutex]::new($false, "Local\DineFlow-$id")

function Read-Setting($file, $name, $fallback) {
    $line = Get-Content -LiteralPath $file | Where-Object { $_ -match "^$name=" } | Select-Object -Last 1
    if ($null -eq $line) { return $fallback }
    return $line.Substring($name.Length + 1).Trim().Trim('"').Trim("'")
}

function Test-Port($port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { return $client.ConnectAsync('127.0.0.1', $port).Wait(300) -and $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}

function Start-ServiceProcess($name, $program, $arguments, $directory) {
    $process = Start-Process -FilePath $program -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name-error.log")
    $children.Add($process)
    $processGroup.Add($process.Handle)
    Write-Host "Started $name."
}

try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) {
        Write-Host 'DineFlow is already running. Use the existing launcher window.'
        return
    }

    foreach ($file in @('backend\.env', 'backend\vendor\autoload.php', 'frontend\node_modules\vite\bin\vite.js')) {
        if (-not (Test-Path (Join-Path $root $file))) { throw "Missing $file. Complete the local project setup first." }
    }
    $php = (Get-Command php.exe -ErrorAction Stop).Source
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $env:PATH = "$(Split-Path $php -Parent);$env:PATH"
    if (Test-Path (Join-Path $backend 'php.ini')) { $env:PHPRC = Join-Path $backend 'php.ini' }
    & $php (Join-Path $PSScriptRoot 'Check-DeliveryRequirements.php')
    if ($LASTEXITCODE -ne 0) { throw 'PHP GD is required for delivery photos. Enable extension=gd in your PHP configuration, then restart this launcher.' }
    $config = Join-Path $backend '.env'
    $apiUrl = [uri](Read-Setting $config 'APP_URL' 'http://localhost:8081')
    $webUrl = [uri](Read-Setting $config 'FRONTEND_URL' 'http://localhost:5173')
    $reverbPort = [int](Read-Setting $config 'REVERB_SERVER_PORT' '8080')
    foreach ($port in @($apiUrl.Port, $webUrl.Port, $reverbPort)) {
        if (Test-Port $port) { throw "Port $port is already in use. Close the existing app/server before starting DineFlow." }
    }
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    Add-Type -Path (Join-Path $PSScriptRoot 'ProcessGroup.cs')
    $processGroup = [DineFlowProcessGroup]::new()
    $pgCtl = Join-Path $root '.local\pg17\pgsql\bin\pg_ctl.exe'
    $pgData = Join-Path $root '.local\pgdata17'
    $dbHost = Read-Setting $config 'DB_HOST' '127.0.0.1'
    if ((Read-Setting $config 'DB_CONNECTION' 'pgsql') -eq 'pgsql' -and $dbHost -in @('127.0.0.1', 'localhost') -and (Test-Path $pgCtl) -and (Test-Path $pgData)) {
        & $pgCtl -D $pgData status *> $null
        if ($LASTEXITCODE -ne 0) {
            $dbPort = [int](Read-Setting $config 'DB_PORT' '5432')
            if (Test-Port $dbPort) { throw "Database port $dbPort is occupied by another PostgreSQL instance." }
            & $pgCtl -D $pgData -l (Join-Path $root '.local\postgres17.log') -o "-p $dbPort -h 127.0.0.1" -w start
            if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL could not start. Check .local\postgres17.log.' }
            $databaseStarted = $true
            $databaseId = [int](Get-Content -LiteralPath (Join-Path $pgData 'postmaster.pid') -TotalCount 1)
            $databaseTicks = (Get-Process -Id $databaseId).StartTime.ToUniversalTime().Ticks
            $launcherTicks = (Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks
            $watcher = Join-Path $PSScriptRoot 'Watch-Database.ps1'
            Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$watcher`"", '-LauncherId', $PID, '-LauncherStartTicks', $launcherTicks, '-ProjectRoot', "`"$root`"", '-DatabaseId', $databaseId, '-DatabaseStartTicks', $databaseTicks)
        }
    }

    Push-Location $backend
    try {
        & $php artisan config:clear --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Could not reload the local environment settings.' }
        & $php artisan migrate --force --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Database updates failed. Check the error above before starting DineFlow.' }
        & $php artisan dineflow:deploy --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'Initial administrator setup failed. Check the settings above and apply any pending database migrations.' }
    } finally { Pop-Location }

    Start-ServiceProcess 'api' $php @('artisan', 'serve', '--host=127.0.0.1', "--port=$($apiUrl.Port)", '--tries=1', '--no-reload') $backend
    Start-ServiceProcess 'frontend' $node @('node_modules/vite/bin/vite.js', '--host=127.0.0.1', "--port=$($webUrl.Port)", '--strictPort') $frontend
    Start-ServiceProcess 'reverb' $php @('artisan', 'reverb:start', '--host=127.0.0.1', "--port=$reverbPort") $backend
    Start-ServiceProcess 'scheduler' $php @('artisan', 'schedule:work') $backend

    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        foreach ($child in $children) {
            if ($child.HasExited) { throw "A DineFlow service stopped. Check logs in $logs." }
        }
        $ready = (Test-Port $apiUrl.Port) -and (Test-Port $webUrl.Port) -and (Test-Port $reverbPort)
        if (-not $ready) { Start-Sleep -Milliseconds 500 }
    } until ($ready -or [DateTime]::UtcNow -ge $deadline)
    if (-not $ready) { throw "Startup timed out. Check logs in $logs." }
    Write-Host "`nDineFlow is ready at $webUrl" -ForegroundColor Green
    Write-Host "Logs: $logs"
    if ($SmokeTest) {
        $response = Invoke-WebRequest -Uri $webUrl.AbsoluteUri -UseBasicParsing
        if ($response.StatusCode -ne 200) { throw 'Frontend check failed.' }
        Write-Host 'Startup check passed.'
    } else {
        Start-Process $webUrl.AbsoluteUri
        Write-Host 'Press Enter or close this window to stop DineFlow.'
        while ($true) {
            if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq [ConsoleKey]::Enter) { break }
            foreach ($child in $children) {
                if ($child.HasExited) { throw "A DineFlow service stopped. Check logs in $logs." }
            }
            Start-Sleep -Milliseconds 300
        }
    }
} catch {
    Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    if ($null -ne $processGroup) { $processGroup.Dispose() }
    foreach ($child in $children) {
        if (-not $child.HasExited) { & taskkill.exe /PID $child.Id /T /F *> $null }
        $child.Dispose()
    }
    if ($databaseStarted) { & $pgCtl -D $pgData -m fast -w stop }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
exit $exitCode
