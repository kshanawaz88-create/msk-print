$ErrorActionPreference = "Stop"

$raw = [Console]::In.ReadToEnd()
$payload = $raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$payload.printerName)) {
  throw "printerName is required"
}

$requestedIds = @($payload.jobIds | ForEach-Object { [int]$_ })
if ($requestedIds.Count -eq 0) {
  throw "At least one captured print job ID is required"
}
$cancelled = @()
foreach ($job in @(Get-PrintJob -PrinterName ([string]$payload.printerName) -ErrorAction Stop)) {
  if ($requestedIds -contains [int]$job.ID) {
    $job | Remove-PrintJob -Confirm:$false -ErrorAction Stop
    $cancelled += [int]$job.ID
  }
}

@{ cancelledJobIds = $cancelled } | ConvertTo-Json -Depth 3 -Compress
