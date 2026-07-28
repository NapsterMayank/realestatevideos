$vcpkgBin = "C:\vcpkg\installed\x64-windows\bin"
$releaseDir = "d:\personal\realEstateVids\node_modules\canvas\build\Release"

if (!(Test-Path $releaseDir)) {
    Write-Error "canvas not built yet -- run 'npm rebuild canvas' first"
    exit 1
}

if (!(Test-Path $vcpkgBin)) {
    Write-Error "vcpkg install not found at $vcpkgBin"
    exit 1
}

Copy-Item "$vcpkgBin\*.dll" $releaseDir -Force
Write-Host "Successfully copied DLLs to $releaseDir"
