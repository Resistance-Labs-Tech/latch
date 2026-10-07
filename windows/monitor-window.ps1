Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class User32Monitor {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$lastHwnd = 0
$lastTitle = ""

while ($true) {
  $hwnd = [User32Monitor]::GetForegroundWindow()
  $pidValue = 0
  [void][User32Monitor]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)

  $titleBuilder = New-Object System.Text.StringBuilder 1024
  [void][User32Monitor]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString()

  if ($hwnd.ToInt64() -ne $lastHwnd -or $title -ne $lastTitle) {
    $processName = ""
    try {
      $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName
    } catch {
      $processName = ""
    }

    [PSCustomObject]@{
      hwnd = $hwnd.ToInt64()
      processId = $pidValue
      processName = $processName
      title = $title
      at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress

    $lastHwnd = $hwnd.ToInt64()
    $lastTitle = $title
  }

  Start-Sleep -Milliseconds 250
}
