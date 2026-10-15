$ErrorActionPreference = "Stop"
$root = "c:\Users\riuki\lemayian-court"
. (Join-Path $root "_import.ps1")

# Rebuild the same objects the import script produced, then emit JS.
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
      if ($dateRaw -eq "" -and $sec -eq $null -and $oth -eq $null -and $tot -eq $null -and $crd -eq $null) { continue }
      $iso = if ($dateRaw -match "^\d{4}-\d{2}-\d{2}$") { $dateRaw } else { Convert-TextDate $dateRaw }
      $ledger.Add([pscustomobject]@{
        Year=$yr; Resident=$r.Name; StartCol=$c0; Row=$row
        DateRaw=$dateRaw; Date=$iso; SecLabel=$secLabel; Sec=$sec; Others=$oth; Total=$tot; Credit=$crd
        Balance=(Num $yr $row ($c0+5))
      })
    }
  }
}

# A row is a real transaction when its Date cell (col c0) holds a value AND the row carries
# money. This is structural, not positional: ledgers differ in length (2021 has no b/fwd row,
# 2024 runs to row 36), and rows 34+ may still contain genuine charges.
# The 2026 sheet is the exception — there, rows 31+ are footers ('@', report date, 'Other Projects').
$tx = $ledger | Where-Object {
  $_.Row -ge 9 -and $_.Date -and $_.Date -ne "" -and
  ($_.Total -ne $null -or $_.Credit -ne $null -or $_.Sec -ne $null)
}

# 2021 is the only sheet whose opening row carries a date but no money columns: it records each
# resident's opening position in the Balance column of row 9 alone (Total/Credit are blank).
# Treat that row as the year's opening balance by reading the sheet's own row-9 Balance value.
$bfwd = New-Object System.Collections.Generic.List[object]
foreach ($r in $RESIDENTS) {
  $row9Bal = Num "2021" 9 ($r.StartCol + 5)
  $row9Tot = Num "2021" 9 ($r.StartCol + 3)
  if ($row9Bal -ne $null -and $row9Tot -eq $null) {
    $bfwd.Add([pscustomobject]@{
      Year="2021"; Resident=$r.Name; StartCol=$r.StartCol; Row=9
      DateRaw="2021-01-01"; Date="2021-01-01"; Sec=$null; Others=$null
      Total=[double]$row9Bal; Credit=$null; Balance=[double]$row9Bal
    })
  }
}
if ($bfwd.Count -gt 0) {
  $merged = New-Object System.Collections.Generic.List[object]
  foreach ($b in $bfwd) { $merged.Add($b) }
  foreach ($t in $tx) { $merged.Add($t) }
  $tx = $merged
}
Write-Output "2021 synthesised opening rows: $($bfwd.Count)"

# Attribute every row to the year of the SHEET that owns it — the sheet is authoritative.
# Two quirks are preserved rather than "corrected", because each sheet reconciles internally:
#  • Sheets end with a spillover row dated in early January of the next year
#    (e.g. 2021!R29 dated 2022-01-04). It is part of that sheet's own balance chain.
#  • The 2026 sheet has rows whose year was mistyped as 2025 (e.g. Mbindu 2026-04-25).
#    These are 2026 activity, so the sheet wins over the typed year.
# Duplicate carried-forward balances are handled downstream: buildSeedTxns() keeps only the
# earliest b/fwd row per resident as the opening balance and marks later ones as `restated`.
$tx = $tx | Where-Object { $true }

$ridMap = @{ "Hon. Ndetei"="r1"; "Esther Gicimu"="r2"; "Njoroge"="r3"; "Magomere"="r4"
             "Karanja"="r5"; "Muriuki"="r6"; "Mbindu"="r7"; "Mwanthi"="r8" }

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("// ══════════════════════════════════════════════════════════════════════")
$lines.Add("// GENERATED FROM `"Lemayian Court Accounts 2026.xlsx`" — do not hand-edit.")
$lines.Add("// Sheets: GateHouse, 2021..2026, SProviders, Payment Details.")
$lines.Add("// Each entry: [year, residentId, ISO date, kind, security, others, credit, sourceRow]")
$lines.Add("// ══════════════════════════════════════════════════════════════════════")
$lines.Add("export const WORKBOOK_LEDGER = [")
$byYear = $tx | Group-Object Year
foreach ($g in ($byYear | Sort-Object Name)) {
  $lines.Add("  // ── $($g.Name) ──")
  foreach ($e in ($g.Group | Sort-Object @{Expression={$ridMap[$_.Resident]}}, @{Expression={$_.Row}})) {
    $date = if ($e.Date) { $e.Date } else { "null" }
    $isBfwd = ($e.SecLabel -eq "b/fwd") -or ($e.Row -eq 9 -and $e.Sec -eq $null -and $e.Credit -eq $null -and $e.Total -ne $null)
    if ($isBfwd) {
      # Opening balance: net amount (charge - credit) is the carried-forward position.
      $net = [int64]($e.Total) - [int64]$(if ($e.Credit) { $e.Credit } else { 0 })
      $lines.Add("  {y:`"$($e.Year)`",r:`"$($ridMap[$e.Resident])`",d:`"$date`",k:`"b/fwd`",s:$net,o:0,c:0,src:`"$($e.Year)!R$($e.Row)C$($e.StartCol)`"},")
    } else {
      $kind = if ($e.Credit -ne $null -and $e.Total -eq $null) { "payment" } else { "charge" }
      $sec = if ($e.Sec -ne $null) { [int64]$e.Sec } else { 0 }
      $oth = if ($e.Others -ne $null) { [int64]$e.Others } else { 0 }
      $crd = if ($e.Credit -ne $null) { [int64]$e.Credit } else { 0 }
      $lines.Add("  {y:`"$($e.Year)`",r:`"$($ridMap[$e.Resident])`",d:`"$date`",k:`"$kind`",s:$sec,o:$oth,c:$crd,src:`"$($e.Year)!R$($e.Row)C$($e.StartCol)`"},")
    }
  }
}
$lines.Add("];")
[IO.File]::WriteAllLines((Join-Path $root "src\workbookLedger.js"), $lines.ToArray(), (New-Object Text.UTF8Encoding($false)))

$counts = $tx | Group-Object Year | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Count)" }
Write-Output ("Rows emitted: " + ($tx.Count))
Write-Output ("By year: " + ($counts -join " "))
$bals = @{}
foreach ($e in $tx) {
  $k = $ridMap[$e.Resident]
  if (-not $bals.ContainsKey($k)) { $bals[$k] = 0 }
  $bals[$k] += [int64]($e.Total) - [int64]($e.Credit)
}
Write-Output "--- Recomputed balances from workbook rows ---"
foreach ($k in ($bals.Keys | Sort-Object)) { Write-Output "$k = $($bals[$k])" }
