# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Change to the script directory
Set-Location $ScriptDir

# Parse command line arguments
$Headless = $false
foreach ($arg in $args) {
    if ($arg -eq "--headless") {
        $Headless = $true
    }
}

# Check if node_modules exists - only install in dev mode if missing
if (-not (Test-Path "node_modules")) {
    Write-Host "Dependencies not found. Installing..."
    npm install
}

Write-Host "Starting dev-browser server..."
$env:HEADLESS = "$Headless"
npx tsx scripts/start-server.ts
