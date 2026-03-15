$file = "src\app\client\client-onboarding.html"
$lines = Get-Content $file
# Lines are 1-indexed in editor but 0-indexed in array
# Remove lines 392-460 (0-indexed: 391-459) which contain orphaned closing div + duplicate content-aside
$newContent = @()
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($i -lt 391 -or $i -ge 460) {
        $newContent += $lines[$i]
    }
}
$newContent | Set-Content -Path $file -Encoding UTF8
Write-Host "Done. Total lines: $($newContent.Length)"
