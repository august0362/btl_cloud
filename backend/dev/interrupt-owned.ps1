param([Parameter(Mandatory=$true)][int]$TargetProcessId,
      [Parameter(Mandatory=$true)][string]$ExpectedPath,
      [Parameter(Mandatory=$true)][long]$StartedAt,
      [int]$Port = 0)
$ErrorActionPreference = 'Stop'
$rootProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $TargetProcessId"
if (-not $rootProcess) { exit 0 }
if ($rootProcess.ExecutablePath -ne $ExpectedPath) { throw 'Process executable does not match owned child' }
$createdAt = ([DateTimeOffset]$rootProcess.CreationDate).ToUnixTimeMilliseconds()
if ([Math]::Abs($createdAt - $StartedAt) -gt 5000) { throw 'Process identity changed' }
$ownedIds = [System.Collections.Generic.HashSet[uint32]]::new()
$null = $ownedIds.Add([uint32]$TargetProcessId)
$processes = Get-CimInstance Win32_Process
do {
  $added = $false
  foreach ($entry in $processes) {
    if ($ownedIds.Contains([uint32]$entry.ParentProcessId) -and $ownedIds.Add([uint32]$entry.ProcessId)) { $added = $true }
  }
} while ($added)
if ($Port -gt 0) {
  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port
  if (-not $listeners) { throw 'Owned MySQL listener is missing' }
  foreach ($listener in $listeners) {
    if (-not $ownedIds.Contains([uint32]$listener.OwningProcess)) { throw 'Port belongs to an unrelated process' }
  }
  exit 0
}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class BtlConsole {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint id);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern uint GetConsoleProcessList(uint[] ids, uint count);
  private delegate bool Handler(uint signal);
  private static Handler ignore = signal => true;
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool SetConsoleCtrlHandler(Handler handler, bool add);
  public static bool IgnoreInterrupt() { return SetConsoleCtrlHandler(ignore, true); }
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GenerateConsoleCtrlEvent(uint evt, uint group);
}
"@
$null = [BtlConsole]::FreeConsole()
if (-not [BtlConsole]::AttachConsole([uint32]$TargetProcessId)) { throw 'Owned child has no dedicated console' }
try {
  $null = [BtlConsole]::IgnoreInterrupt()
  $consoleIds = New-Object uint32[] 256
  $count = [BtlConsole]::GetConsoleProcessList($consoleIds, 256)
  if ($count -eq 0 -or $count -gt 256) { throw 'Cannot verify console membership' }
  for ($index = 0; $index -lt $count; $index++) {
    if ($consoleIds[$index] -ne $PID -and -not $ownedIds.Contains($consoleIds[$index])) {
      throw 'Refusing to signal a console shared with an unrelated process'
    }
  }
  if (-not [BtlConsole]::GenerateConsoleCtrlEvent(1, 0)) { throw 'Cannot signal owned console' }
  Start-Sleep -Milliseconds 150
} finally { $null = [BtlConsole]::FreeConsole() }
