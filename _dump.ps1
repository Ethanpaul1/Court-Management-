$ErrorActionPreference = "Stop"
$base = "c:\Users\riuki\lemayian-court\_wbx"
$out  = "c:\Users\riuki\lemayian-court\_dump"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

# ---- shared strings ----
$ss = @()
if (Test-Path "$base\xl\sharedStrings.xml") {
  $sx = [xml](Get-Content "$base\xl\sharedStrings.xml" -Raw)
  foreach ($si in $sx.sst.si) {
    if ($si.t -is [string]) { $ss += $si.t }
    elseif ($si.t -ne $null) { $ss += $si.t.'#text' }
    else { $ss += (($si.r | ForEach-Object { $_.t.'#text' }) -join '') }
  }
}

# ---- number formats that are dates ----
$sty = [xml](Get-Content "$base\xl\styles.xml" -Raw)
$dateFmtIds = @{}
# built-in date formats
foreach ($id in (14..22) + (27..36) + (45..47) + (50..58)) { $dateFmtIds[[int]$id] = $true }
# custom formats: only a date if the code uses date tokens (d/m/y/h/s) and no # or 0 digit placeholders
foreach ($n in $sty.styleSheet.numFmts.numFmt) {
  $code = "$($n.formatCode)"
  $isDate = $false
  if ($code -notmatch '[#0]') {
    if ($code -match '[dmyhs]') { $isDate = $true }
  } else {
    # e.g. "[$]d mmm yyyy;@" contains no digit placeholders; a code like "#,##0.00" does
    $stripped = ($code -replace '"[^"]*"', '') -replace '\[[^\]]*\]', ''
    if ($stripped -notmatch '[#0]' -and $stripped -match '[dmyhs]') { $isDate = $true }
  }
  if ($isDate) { $dateFmtIds[[int]$n.numFmtId] = $true }
}
$styleIsDate = @{}
$i = 0
foreach ($xf in $sty.styleSheet.cellXfs.xf) {
  $nid = 0
  if ($xf.numFmtId -ne $null) { $nid = [int]$xf.numFmtId }
  if ($dateFmtIds.ContainsKey($nid)) { $styleIsDate[$i] = $true }
  $i++
}
Write-Output "date numFmtIds: $(($dateFmtIds.Keys | Sort-Object) -join ',')"

function Convert-ExcelDate([double]$serial) {
  # Excel 1900 date system: serial 1 = 1900-01-01, with the 1900 leap-year bug
  $d = [DateTime]"1899-12-30"
  return $d.AddDays($serial)
}

function Col-ToIndex([string]$col) {
  $n = 0
  foreach ($c in $col.ToCharArray()) { $n = $n * 26 + ([int][char]$c - 64) }
  return $n
}
function Index-ToCol([int]$n) {
  $s = ""
  while ($n -gt 0) {
    $m = ($n - 1) % 26
    $s = [char](65 + $m) + $s
    $n = [math]::Floor(($n - 1) / 26)
  }
  return $s
}

$maps = Get-Content "c:\Users\riuki\lemayian-court\_sheetmap.json" -Raw | ConvertFrom-Json

foreach ($sh in $maps) {
  $path = Join-Path $base ("xl\" + $sh.File)
  $x = [xml](Get-Content $path -Raw)
  $all = New-Object System.Collections.Generic.List[string]
  $all.Add("=== SHEET: $($sh.Name)  ($($sh.File)) ===")
  foreach ($row in $x.worksheet.sheetData.row) {
    $rIdx = [int]$row.r
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($c in $row.c) {
      $ref = "$($c.r)"
      $t = "$($c.t)"
      $v = "$($c.v)"
      $f = "$($c.f)"
      $txt = ""
      if ($t -eq "s" -and $v -ne "") {
        $txt = $ss[[int]$v]
      } elseif ($t -eq "inlineStr") {
        $txt = "$($c.is.t)"
        if ($txt -eq "") { $txt = (($c.is.r | ForEach-Object { "$($_.t)" }) -join '') }
      } elseif ($v -ne "") {
        $asDouble = 0.0
        $parsed = [double]::TryParse($v, [ref]$asDouble)
        if ($styleIsDate.ContainsKey([int]$c.s) -and $parsed) {
          $txt = (Convert-ExcelDate $asDouble).ToString("yyyy-MM-dd")
        } else {
          $txt = $v
        }
      }
      $piece = "$ref=$txt"
      if ($f -ne "") { $piece += " {F:$f}" }
      $parts.Add($piece)
    }
    if ($parts.Count -gt 0) { $all.Add("R$rIdx : " + ($parts -join " | ")) }
  }
  $safe = ($sh.Name -replace '[^\w\-]', '_')
  [IO.File]::WriteAllLines((Join-Path $out "$safe.txt"), $all.ToArray(), [Text.Encoding]::UTF8)
  Write-Output "$($sh.Name): $($all.Count) lines"
}

