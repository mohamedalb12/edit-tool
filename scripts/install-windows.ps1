# EditFast — مثبّت ويندوز. شغّله بكليك يمين > Run with PowerShell (أو من install-windows.bat).
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:APPDATA 'Adobe\CEP\extensions\EditFast'
Write-Host "==> نسخ الإضافة إلى $dest"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($d in 'CSXS','client','core','host','assets','bin') { if (Test-Path (Join-Path $src $d)) { Copy-Item (Join-Path $src $d) $dest -Recurse -Force } }
Copy-Item (Join-Path $src 'README.md') $dest -ErrorAction SilentlyContinue

Write-Host "==> تفعيل الإضافات الغير موقّعة (PlayerDebugMode)"
foreach ($v in 9,10,11,12,13) { New-Item -Path "HKCU:\Software\Adobe\CSXS.$v" -Force | Out-Null; Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.$v" -Name 'PlayerDebugMode' -Value '1' }

Write-Host "==> ffmpeg"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements }
  else { Write-Warning 'ثبّت ffmpeg من https://www.gyan.dev/ffmpeg/builds/ وحدد مكانه من إعدادات EditFast' }
} else { Write-Host '   موجود ✓' }

Write-Host "==> whisper.cpp (التفريغ الأوفلاين)"
$bin = Join-Path $dest 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
if (-not (Test-Path (Join-Path $bin 'whisper-cli.exe'))) {
  try {
    $zip = Join-Path $env:TEMP 'whisper-bin-x64.zip'
    Invoke-WebRequest 'https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip' -OutFile $zip
    $tmp = Join-Path $env:TEMP 'whisper-bin'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive $zip $tmp -Force
    Get-ChildItem $tmp -Recurse -Include *.exe,*.dll | ForEach-Object { Copy-Item $_.FullName $bin -Force }
    Write-Host '   اتثبت ✓'
  } catch { Write-Warning 'مقدرتش أنزّل whisper.cpp — نزّله من https://github.com/ggml-org/whisper.cpp/releases وحط whisper-cli.exe في الإعدادات' }
}
Write-Host ""
Write-Host "خلصت ✓  افتح بريمير > Window > Extensions > EditFast"
Write-Host "أول مرة: من تبويب الإعدادات حط مفتاح OpenRouter وحمّل موديل Whisper."
