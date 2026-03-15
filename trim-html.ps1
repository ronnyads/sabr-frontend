param([string]$file = "src\app\client\client-onboarding.html", [int]$keepLines = 462)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$content = [System.IO.File]::ReadAllLines((Resolve-Path $file), [System.Text.Encoding]::UTF8)
Write-Host "Current lines: $($content.Length)"
$trimmed = $content[0..($keepLines-1)]
[System.IO.File]::WriteAllLines((Resolve-Path $file), $trimmed, [System.Text.Encoding]::UTF8)
Write-Host "Trimmed to: $($trimmed.Length) lines"
