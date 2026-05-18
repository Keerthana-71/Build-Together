$filePath = Join-Path $PSScriptRoot 'home.html'
$src = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

$old = "    // Refund -- goes to admin`n    { p:['refund','money back','withdrawal'],`n      r:'For refund queries, please contact our support team directly:\n\nEmail: info@buildtogether.in\nPhone: +91 98765 43210\n\nOur team will assist you within 24 hours.' },"

$new = "    // Refund -- intentionally NOT handled here so admin contact prompt appears"

$newSrc = $src.Replace($old, $new)
if ($newSrc -eq $src) { Write-Error "Pattern not found"; exit 1 }

[System.IO.File]::WriteAllText($filePath, $newSrc, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
