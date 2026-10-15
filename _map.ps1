$ErrorActionPreference = "Stop"
$base = "c:\Users\riuki\lemayian-court\_wbx"
$wb = [xml](Get-Content "$base\xl\workbook.xml" -Raw)
$rel = [xml](Get-Content "$base\xl\_rels\workbook.xml.rels" -Raw)
$ridMap = @{}
foreach ($r in $rel.Relationships.Relationship) { $ridMap[$r.Id] = $r.Target }

$sheets = @()
foreach ($s in $wb.workbook.sheets.sheet) {
  $rid = $s.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
  $tgt = $ridMap[$rid] -replace "^\W", ""
  $sheets += [pscustomobject]@{ Name = $s.name; File = $tgt }
}
$sheets | Format-Table -AutoSize
$sheets | ConvertTo-Json -Depth 3 | Set-Content "c:\Users\riuki\lemayian-court\_sheetmap.json" -Encoding UTF8
