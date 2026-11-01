$ErrorActionPreference = 'Stop'

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw 'Python 3.11 or newer was not found. Install Python and reopen this terminal.'
}
if (-not (Test-Path (Join-Path $PSScriptRoot 'requirements.txt'))) {
    throw 'requirements.txt is missing from the game folder.'
}

$env:HOST = '127.0.0.1'
$env:PORT = '8765'
$env:ALLOWED_ORIGINS = 'https://vflzx.github.io,http://localhost:8000,http://127.0.0.1:8000'

Write-Host 'Starting the Void Pig Wars PC server on 127.0.0.1:8765.'
Write-Host 'Keep this window open while hosting. Press Ctrl+C to stop.'
Push-Location $PSScriptRoot
try {
    & $python.Source -m pip show websockets *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'The websockets package is missing. Run: python -m pip install -r requirements.txt'
    }
    & $python.Source server.py
    if ($LASTEXITCODE -ne 0) {
        throw "The server exited with status $LASTEXITCODE. Check Python and the server output above."
    }
}
finally {
    Pop-Location
}
