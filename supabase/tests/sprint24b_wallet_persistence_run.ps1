[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_wallet_persistence.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    $parsed = $response.Content | ConvertFrom-Json
    if (-not $parsed.user.id) { throw "Auth signup did not return a user id for $Email" }
    return [guid]$parsed.user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) {
    throw "Local Supabase container '$container' is not running. Start Supabase locally before running this test."
}

$emailA = "gemn.s24b.$RunId.a@example.test"
$emailB = "gemn.s24b.$RunId.b@example.test"
$password = "GEMN-S24B-$RunId-Pass!"
$userA = Invoke-LocalAuth -Email $emailA -Password $password
$userB = Invoke-LocalAuth -Email $emailB -Password $password

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "user_a_id=$userA" -v "user_b_id=$userB" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Sprint 2.4B wallet persistence tests failed: $($result -join [Environment]::NewLine)"
}

$result
