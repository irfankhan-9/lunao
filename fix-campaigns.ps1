$content = Get-Content -Path 'src\components\Campaigns.tsx' -Raw
# Pattern to match: from SMS Coming Soon placeholder through </div> after it, 
# then everything until RECENT CAMPAIGNS FULL LOG TABLE
$pattern = '(\s*{\/\* SMS Coming Soon placeholder.*?</div>\s*</div>)[\s\S]*?({/\* RECENT CAMPAIGNS FULL LOG TABLE)'
if ($content -match $pattern) {
    Write-Host "Found pattern with $($matches.Count) captures"
    $newContent = $matches[1] + "`n      </section>`n`n        " + $matches[2]
    $result = $content -replace $pattern, $newContent
    Set-Content -Path 'src\components\Campaigns.tsx' -Value $result
    Write-Host 'SUCCESS - Pattern 1'
} else {
    Write-Host 'Pattern 1 failed, trying Pattern 2...'
    # Try with escaped backticks
    $pattern2 = '(\s*`/\* SMS Coming Soon placeholder.*?</div>\s*</div>)[\s\S]*?(`/\* RECENT CAMPAIGNS FULL LOG TABLE)'
    if ($content -match $pattern2) {
        Write-Host "Found with Pattern 2"
    } else {
        Write-Host 'Still no match'
        # Write what we're looking for
        $idx = $content.IndexOf('Coming Soon placeholder')
        if ($idx -ge 0) {
            Write-Host "Found 'Coming Soon placeholder' at position $idx"
            Write-Host "Context:"
            Write-Host $content.Substring([Math]::Max(0, $idx-50), 200)
        }
    }
}
