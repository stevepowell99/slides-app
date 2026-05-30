# Build the public site into _site/ for static hosting (Netlify).
# Renders every deck whose front matter has `public: true`, copies the
# self-contained HTML to _site/<deck>/index.html, and writes _site/index.html.
# Decks without `public: true` are left out of the published site.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$siteDir = Join-Path $root '_site'

# Locate quarto (PATH first, then the standard install).
$quarto = (Get-Command quarto -ErrorAction SilentlyContinue).Source
if (-not $quarto) { $quarto = 'C:\Program Files\Quarto\bin\quarto.cmd' }
if (-not (Test-Path $quarto)) { throw "quarto not found. Install from https://quarto.org or fix the path in build-site.ps1." }

# Fresh _site.
if (Test-Path $siteDir) { Remove-Item -Recurse -Force $siteDir }
New-Item -ItemType Directory -Force $siteDir | Out-Null

$skip = @('app', 'fontawesome', 'node_modules')
$decks = @()

foreach ($dir in Get-ChildItem -Path $root -Directory) {
    if ($dir.Name -match '^[_.]' -or $skip -contains $dir.Name -or $dir.Name -match '_files$') { continue }
    $qmd = Get-ChildItem -Path $dir.FullName -Filter *.qmd -File | Select-Object -First 1
    if (-not $qmd) { continue }

    $text = Get-Content $qmd.FullName -Raw
    # Front matter is the block between the first two --- lines.
    $fm = if ($text -match '(?s)^---\r?\n(.*?)\r?\n---') { $Matches[1] } else { '' }
    if ($fm -notmatch '(?m)^\s*public:\s*true\s*$') { continue }

    $title = $dir.Name
    if ($fm -match '(?m)^\s*title:\s*(.+?)\s*$') { $title = $Matches[1].Trim('"', "'") }
    elseif ($fm -match '(?m)^\s*pagetitle:\s*(.+?)\s*$') { $title = $Matches[1].Trim('"', "'") }

    $decks += [pscustomobject]@{
        Slug    = $dir.Name
        Qmd     = $qmd.FullName
        Html    = Join-Path $dir.FullName ($qmd.BaseName + '.html')
        Title   = $title
        IsDemo  = $dir.Name -match '^demo-'
    }
}

if ($decks.Count -eq 0) { throw "No decks with 'public: true' found." }

foreach ($d in $decks) {
    Write-Host "Rendering $($d.Slug)..."
    & $quarto render $d.Qmd --quiet
    if (-not (Test-Path $d.Html)) { throw "Render produced no HTML for $($d.Slug) (expected $($d.Html))." }
    $dest = Join-Path $siteDir $d.Slug
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item $d.Html (Join-Path $dest 'index.html') -Force
}

# Landing page.
function Format-Links($items) {
    ($items | ForEach-Object {
        "      <li><a href=`"./$($_.Slug)/`">$([System.Web.HttpUtility]::HtmlEncode($_.Title))</a></li>"
    }) -join "`n"
}
Add-Type -AssemblyName System.Web
$real = $decks | Where-Object { -not $_.IsDemo } | Sort-Object Title
$demo = $decks | Where-Object { $_.IsDemo } | Sort-Object Title

$demoBlock = ''
if ($demo) {
    $demoBlock = @"
    <h2>Theme demos</h2>
    <ul>
$(Format-Links $demo)
    </ul>
"@
}

$html = @"
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Causal Map slide decks</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 4rem auto; padding: 0 1.5rem; color: #1b1b3a; line-height: 1.5; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; color: #555; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.4rem 0; }
    a { color: #2a4eff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Causal Map slide decks</h1>
  <p>Read-only RevealJS decks. Use the arrow keys to navigate; press <kbd>S</kbd> for speaker notes where present.</p>
    <h2>Decks</h2>
    <ul>
$(Format-Links $real)
    </ul>
$demoBlock
</body>
</html>
"@

Set-Content -Path (Join-Path $siteDir 'index.html') -Value $html -Encoding utf8
Write-Host "Built _site/ with $($decks.Count) deck(s)."
