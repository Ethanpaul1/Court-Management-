$ErrorActionPreference = "Stop"
$base = "c:\Users\riuki\lemayian-court\_wbx"

$ss = @()
$sx = [xml](Get-Content "$base\xl\sharedStrings.xml" -Raw)
foreach ($si in $sx.sst.si) {
  $t = "$($si.t)"
  if ($t -ne "") { $ss += $t } else { $ss += (($si.r | ForEach-Object { "$($_.t)" }) -join '') }
}

$sty = [xml](Get-Content "$base\xl\styles.xml" -Raw)
$dateFmtIds = @{}
foreach ($id in (14..22) + (27..36) + (45..47) + (50..58)) { $dateFmtIds[[int]$id] = $true }
foreach ($n in $sty.styleSheet.numFmts.numFmt) {
  $code = "$($n.formatCode)"
  $stripped = ($code -replace '"[^"]*"', '') -replace '\[[^\]]*\]', ''
  if ($stripped -notmatch '[#0]' -and $stripped -match '[dmyhs]') { $dateFmtIds[[int]$n.numFmtId] = $true }
}
$styleIsDate = @{}
$i = 0
foreach ($xf in $sty.styleSheet.cellXfs.xf) {
  $nid = 0; if ($xf.numFmtId -ne $null) { $nid = [int]$xf.numFmtId }
  if ($dateFmtIds.ContainsKey($nid)) { $styleIsDate[$i] = $true }
  $i++
}

function Col-ToIndex([string]$col) {
  $n = 0
  foreach ($c in $col.ToCharArray()) { $n = $n * 26 + ([int][char]$c - 64) }
  return $n
}
function Convert-ExcelDate([double]$serial) { return ([DateTime]"1899-12-30").AddDays($serial) }
function Convert-TextDate([string]$s) {
  if ($s -notmatch '\d') { return $null }
  $m = [regex]::Match($s, '(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\w*\s+(\d{4})')
  if ($m.Success) {
    $mon = @{jan=1;feb=2;mar=3;apr=4;may=5;jun=6;jul=7;aug=8;sep=9;oct=10;nov=11;dec=12}[$m.Groups[2].Value.ToLower().Substring(0,3)]
    if ($mon) { return ("{0}-{1:d2}-{2:d2}" -f [int]$m.Groups[3].Value, $mon, [int]$m.Groups[1].Value) }
  }
  return $null
}

function Load-Sheet([string]$file) {
  $x = [xml](Get-Content (Join-Path $base ("xl\worksheets\" + $file)) -Raw)
  $grid = @{}
  foreach ($row in $x.worksheet.sheetData.row) {
    $r = [int]$row.r
    foreach ($c in $row.c) {
      $ref = "$($c.r)"
      $ci = Col-ToIndex ($ref -replace '\d', '')
      $t = "$($c.t)"; $v = "$($c.v)"
      $val = $null
      if ($t -eq "s" -and $v -ne "") { $val = $ss[[int]$v] }
      elseif ($t -eq "inlineStr") { $val = "$($c.is.t)"; if ($val -eq "") { $val = (($c.is.r | ForEach-Object { "$($_.t)" }) -join '') } }
      elseif ($v -ne "") {
        $d = 0.0
        if ($styleIsDate.ContainsKey([int]$c.s) -and [double]::TryParse($v, [ref]$d)) { $val = (Convert-ExcelDate $d).ToString("yyyy-MM-dd") }
        else { $val = $v }
      }
      if ($val -ne $null) { $grid["$r,$ci"] = $val }
    }
  }
  return @{ Grid = $grid }
}

$maps = @{
  GateHouse = "sheet1.xml"; "2021" = "sheet2.xml"; "2022" = "sheet3.xml"; "2023" = "sheet4.xml"
  "2024" = "sheet5.xml"; "2025" = "sheet6.xml"; "2026" = "sheet7.xml"
  SProviders = "sheet8.xml"; "Payment Details" = "sheet9.xml"
}
$sheets = @{}
foreach ($k in $maps.Keys) { $sheets[$k] = Load-Sheet $maps[$k] }

function Cell([string]$sheet, [int]$row, [int]$col) { return $sheets[$sheet].Grid["$row,$col"] }
function Num([string]$sheet, [int]$row, [int]$col) {
  $v = Cell $sheet $row $col
  if ($v -eq $null) { return $null }
  $d = 0.0
  if ([double]::TryParse("$v", [ref]$d)) { return [double]$d }
  return $null
}
function Txt([string]$sheet, [int]$row, [int]$col) {
  $v = Cell $sheet $row $col
  if ($v -eq $null) { return "" }
  return "$v"
}

$YEARS = @("2021","2022","2023","2024","2025","2026")

$RESIDENTS = @()
for ($i = 0; $i -lt 8; $i++) {
  $sc = 1 + ($i * 7)
  $nm = ((Txt "2026" 6 $sc) -replace "'s$", '').Trim()
  $RESIDENTS += [pscustomobject]@{ Index = $i; StartCol = $sc; Name = $nm }
}
$ledger = New-Object System.Collections.Generic.List[object]
foreach ($yr in $YEARS) {
  foreach ($r in $RESIDENTS) {
    $c0 = $r.StartCol
    for ($row = 9; $row -le 36; $row++) {
      $dateRaw = Txt $yr $row $c0
      $secLabel = Txt $yr $row ($c0+1)
      $sec = Num $yr $row ($c0+1)
      $oth = Num $yr $row ($c0+2)
      $tot = Num $yr $row ($c0+3)
      $crd = Num $yr $row ($c0+4)
      $bal = Num $yr $row ($c0+5)
      if ($dateRaw -eq "" -and $sec -eq $null -and $oth -eq $null -and $tot -eq $null -and $crd -eq $null) { continue }
      $iso = $null
      if ($dateRaw -match "^\d{4}-\d{2}-\d{2}$") { $iso = $dateRaw } else { $iso = Convert-TextDate $dateRaw }
      $ledger.Add([pscustomobject]@{
        Year = $yr; Resident = $r.Name; StartCol = $c0; Row = $row
        DateRaw = $dateRaw; Date = $iso; SecLabel = $secLabel; Sec = $sec
        Others = $oth; Total = $tot; Credit = $crd; Balance = $bal
      })
    }
  }
}

$closing = New-Object System.Collections.Generic.List[object]
foreach ($yr in $YEARS) {
  foreach ($r in $RESIDENTS) {
    $last = $null; $lastRow = $null
    for ($row = 36; $row -ge 9; $row--) {
      $b = Num $yr $row ($r.StartCol + 5)
      if ($b -ne $null) { $last = $b; $lastRow = $row; break }
    }
    $closing.Add([pscustomobject]@{ Year = $yr; Resident = $r.Name; Closing = $last; LastRow = $lastRow })
  }
}

$gh = New-Object System.Collections.Generic.List[object]
for ($row = 38; $row -le 42; $row++) {
  $label = Txt "2026" 2 $row
  if ($label -eq "") { $label = Txt "2026" 1 $row }
  foreach ($r in $RESIDENTS) {
    $amt = Num "2026" $row ($r.StartCol + 3)
    if ($amt -ne $null -and $amt -ne 0) {
      $gh.Add([pscustomobject]@{ Resident = $r.Name; Label = $label.Trim(); Amount = $amt; Row = $row })
    }
  }
}

$items = New-Object System.Collections.Generic.List[object]
for ($row = 4; $row -le 25; $row++) {
  $d = Txt "GateHouse" $row 3
  if ($d -eq "") { continue }
  $items.Add([pscustomobject]@{
    Item = Txt "GateHouse" $row 1; Dates = Txt "GateHouse" $row 2; Desc = $d.Trim()
    Estimated = Num "GateHouse" $row 4; Actual = Num "GateHouse" $row 5
    Variance = Num "GateHouse" $row 6; Remarks = (Txt "GateHouse" $row 7).Trim()
  })
}

$pay = New-Object System.Collections.Generic.List[object]
for ($row = 2; $row -le 40; $row++) {
  $d = Txt "Payment Details" $row 1
  $amt = Num "Payment Details" $row 2
  if ($d -eq "" -and $amt -eq $null) { continue }
  $iso = if ($d -match "^\d{4}-\d{2}-\d{2}$") { $d } else { Convert-TextDate $d }
  $pay.Add([pscustomobject]@{ DateRaw = $d; Date = $iso; Amount = $amt
    Code = Txt "Payment Details" $row 3; Time = Txt "Payment Details" $row 4; ForMonth = Txt "Payment Details" $row 5 })
}

$out = [pscustomobject]@{
  Residents = $RESIDENTS
  Closing = $closing
  GateHouseContribs = $gh
  GateHouseItems = $items
  GateHouseTotals = [pscustomobject]@{ Estimated = (Num "GateHouse" 26 4); Actual = (Num "GateHouse" 26 5); Variance = (Num "GateHouse" 26 6) }
  Provider = [pscustomobject]@{
    Name = Txt "SProviders" 3 2; Contact = Txt "SProviders" 4 2
    Mobile = Txt "SProviders" 5 2; Hotline = Txt "SProviders" 6 2
    Paybill = Txt "SProviders" 8 2; MonthlyCharge = Num "SProviders" 10 2
  }
  PaymentDetails = $pay
}
$out | ConvertTo-Json -Depth 6 | Set-Content "c:\Users\riuki\lemayian-court\_imported.json" -Encoding UTF8
$ledger | ConvertTo-Json -Depth 4 | Set-Content "c:\Users\riuki\lemayian-court\_ledger.json" -Encoding UTF8

Write-Output "Ledger rows: $($ledger.Count)"
Write-Output "--- Residents ---"
$RESIDENTS | Format-Table -AutoSize
Write-Output "--- Closing balances ---"
$closing | Format-Table -AutoSize
Write-Output "--- Provider ---"
$out.Provider | Format-List
Write-Output "--- GateHouse totals ---"
$out.GateHouseTotals | Format-List
