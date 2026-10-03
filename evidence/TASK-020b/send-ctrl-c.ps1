param([int]$TargetPid, [string]$StdoutFile, [int]$Count = 1)
$ErrorActionPreference = 'Stop'
function Read-TestStdout {
    $stream = [IO.File]::Open($StdoutFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Task020bConsole {
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GenerateConsoleCtrlEvent(uint signal, uint group);
}
'@
$service = [Diagnostics.Process]::GetProcessById($TargetPid)
[Task020bConsole]::FreeConsole() | Out-Null
if (-not [Task020bConsole]::AttachConsole($TargetPid)) { throw 'AttachConsole failed' }
try {
    # Ignore Ctrl+C in this sender, while Node receives the actual console event.
    if (-not [Task020bConsole]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)) { throw 'SetConsoleCtrlHandler failed' }
    if (-not [Task020bConsole]::GenerateConsoleCtrlEvent(0, 0)) { throw 'GenerateConsoleCtrlEvent failed' }
    $secondExitMs = $null
    if ($Count -eq 2) {
        $deadline = [Diagnostics.Stopwatch]::StartNew()
        while (-not ((Read-TestStdout).Contains('正在关闭'))) {
            if ($deadline.ElapsedMilliseconds -gt 3000) { throw 'First signal handler did not run' }
            Start-Sleep -Milliseconds 5
        }
        $timer = [Diagnostics.Stopwatch]::StartNew()
        if (-not [Task020bConsole]::GenerateConsoleCtrlEvent(0, 0)) { throw 'Second GenerateConsoleCtrlEvent failed' }
        if (-not $service.WaitForExit(1000)) { throw 'Second signal did not exit within 1s' }
        $secondExitMs = $timer.ElapsedMilliseconds
    } else {
        Start-Sleep -Milliseconds 50
    }
    @{ method = 'GenerateConsoleCtrlEvent(CTRL_C_EVENT)'; count = $Count; secondExitMs = $secondExitMs } | ConvertTo-Json -Compress
} finally {
    [Task020bConsole]::FreeConsole() | Out-Null
}
