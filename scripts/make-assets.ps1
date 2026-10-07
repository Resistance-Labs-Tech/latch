$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null

Add-Type -AssemblyName System.Drawing

function New-LatchBitmap([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(248, 245, 236))

  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
    ([System.Drawing.Color]::FromArgb(36, 116, 107)),
    ([System.Drawing.Color]::FromArgb(47, 111, 237)),
    35
  $graphics.FillRectangle($background, $rect)

  $pad = [int]($size * 0.16)
  $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shield.AddLine(($size / 2), $pad, ($size - $pad), ($pad * 1.55))
  $shield.AddLine(($size - $pad), ($pad * 1.55), ($size - $pad), ($size * 0.54))
  $shield.AddBezier(
    (New-Object System.Drawing.PointF (($size - $pad), ($size * 0.54))),
    (New-Object System.Drawing.PointF (($size * 0.82), ($size * 0.76))),
    (New-Object System.Drawing.PointF (($size * 0.68), ($size * 0.86))),
    (New-Object System.Drawing.PointF (($size * 0.5), ($size - $pad)))
  )
  $shield.AddBezier(
    (New-Object System.Drawing.PointF (($size * 0.5), ($size - $pad))),
    (New-Object System.Drawing.PointF (($size * 0.32), ($size * 0.86))),
    (New-Object System.Drawing.PointF (($size * 0.18), ($size * 0.76))),
    (New-Object System.Drawing.PointF ($pad, ($size * 0.54)))
  )
  $shield.AddLine($pad, ($size * 0.54), $pad, ($pad * 1.55))
  $shield.CloseFigure()
  $graphics.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(244, 184, 63))), $shield)

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(22, 24, 23)), ([Math]::Max(6, $size * 0.08))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($pen, @(
    (New-Object System.Drawing.PointF (($size * 0.34), ($size * 0.52))),
    (New-Object System.Drawing.PointF (($size * 0.47), ($size * 0.65))),
    (New-Object System.Drawing.PointF (($size * 0.68), ($size * 0.39)))
  ))

  $graphics.Dispose()
  return $bitmap
}

$pngPath = Join-Path $assets "latch.png"
$bitmap = New-LatchBitmap 512
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$icoPath = Join-Path $assets "latch.ico"
$iconBitmap = New-LatchBitmap 256
$iconHandle = $iconBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$iconBitmap.Dispose()
$bitmap.Dispose()

Write-Host "Generated $pngPath and $icoPath"
