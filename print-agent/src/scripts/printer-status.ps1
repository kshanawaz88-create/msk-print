$ErrorActionPreference = "Stop"

$printers = @(
  Get-CimInstance -ClassName Win32_Printer |
    Select-Object Name, Default, WorkOffline, PrinterStatus, DetectedErrorState, ExtendedPrinterStatus
)

$printers | ConvertTo-Json -Depth 3 -Compress
