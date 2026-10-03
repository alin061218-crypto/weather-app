# PowerShell 7. Only the isolated test service gets this hidden console.
$ErrorActionPreference = 'Stop'
$runDir = $env:TASK020B_RUN_DIR
$service = Start-Process -FilePath $env:TASK020B_NODE `
    -ArgumentList @('--require', './evidence/TASK-020b/observe.cjs', 'server.js') `
    -WorkingDirectory $env:TASK020B_PROJECT -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runDir 'stdout.log') `
    -RedirectStandardError (Join-Path $runDir 'stderr.log') -PassThru
[IO.File]::WriteAllText((Join-Path $runDir 'pid'), [string]$service.Id)
$service.WaitForExit()
[IO.File]::WriteAllText((Join-Path $runDir 'exit.json'), (@{ code = $service.ExitCode; signal = $null } | ConvertTo-Json -Compress))
