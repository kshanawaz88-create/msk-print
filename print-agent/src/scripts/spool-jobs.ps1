$ErrorActionPreference = "Stop"

$raw = [Console]::In.ReadToEnd()
$payload = $raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$payload.printerName)) {
  throw "printerName is required"
}

$jobs = @(
  Get-PrintJob -PrinterName ([string]$payload.printerName) -ErrorAction Stop |
    Select-Object ID, DocumentName, JobStatus, SubmittedTime
)

$jobs | ConvertTo-Json -Depth 3 -Compress
