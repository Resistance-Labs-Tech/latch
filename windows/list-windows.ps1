Add-Type @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;

public static class User32List {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$windows = New-Object System.Collections.Generic.List[object]

$callback = [User32List+EnumWindowsProc] {
  param([IntPtr]$hwnd, [IntPtr]$lParam)

  if (-not [User32List]::IsWindowVisible($hwnd)) {
    return $true
  }

  $titleLength = [User32List]::GetWindowTextLength($hwnd)
  if ($titleLength -le 0) {
    return $true
  }

  $titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
  [void][User32List]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity)
  $title = $titleBuilder.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($title)) {
    return $true
  }

  $pidValue = 0
  [void][User32List]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)

  $processName = ""
  try {
    $processName = (Get-Process -Id $pidValue -ErrorAction Stop).ProcessName
  } catch {
    $processName = ""
  }

  $windows.Add([PSCustomObject]@{
    hwnd = $hwnd.ToInt64()
    processId = $pidValue
    processName = $processName
    title = $title
    at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  })

  return $true
}

[void][User32List]::EnumWindows($callback, [IntPtr]::Zero)

@($windows | Sort-Object processName, title) | ConvertTo-Json -Compress
