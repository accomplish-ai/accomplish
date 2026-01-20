# Convert PNG to ICO for Windows builds
param(
    [string]$PngPath = "../resources/icon.png",
    [string]$IcoPath = "../resources/icon.ico"
)

Add-Type -AssemblyName System.Drawing

# Get absolute paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pngFullPath = Join-Path $scriptDir $PngPath | Resolve-Path
$icoFullPath = Join-Path $scriptDir $IcoPath

Write-Host "Converting PNG to ICO..."
Write-Host "  Source: $pngFullPath"
Write-Host "  Target: $icoFullPath"

try {
    # Load the PNG image
    $img = [System.Drawing.Image]::FromFile($pngFullPath)
    
    # Create a bitmap at the desired size (256x256 for best quality)
    $bitmap = New-Object System.Drawing.Bitmap(256, 256)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($img, 0, 0, 256, 256)
    
    # Convert to icon and save
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    
    # Save as .ico file
    $stream = [System.IO.File]::Create($icoFullPath)
    $icon.Save($stream)
    $stream.Close()
    
    # Cleanup
    $graphics.Dispose()
    $bitmap.Dispose()
    $img.Dispose()
    
    Write-Host "Icon created successfully: $icoFullPath"
    exit 0
}
catch {
    Write-Error "Failed to convert icon: $_"
    exit 1
}
