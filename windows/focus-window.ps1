param(
  [Parameter(Mandatory = $true)]
  [string]$Hwnd
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class User32Focus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
}
"@

$handle = [IntPtr]::new([Int64]$Hwnd)
if ([User32Focus]::IsIconic($handle)) {
  [void][User32Focus]::ShowWindowAsync($handle, 9)
}

[void][User32Focus]::SetForegroundWindow($handle)
