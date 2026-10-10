[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_create_order_gemn.sql'

function New-LocalUser {
    param([string]$Email, [string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    $parsed = $response.Content | ConvertFrom-Json
    [guid]$parsed.user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) {
    throw "Local Supabase container '$container' is not running."
}

$password = "GEMN-S24B-3B-$RunId-Pass!"
$userA = New-LocalUser "gemn.s24b.3b.$RunId.a@example.test" $password
$userB = New-LocalUser "gemn.s24b.3b.$RunId.b@example.test" $password

$keys = @{
    key_gemn = [guid]::NewGuid()
    key_real = [guid]::NewGuid()
    key_mixed = [guid]::NewGuid()
    key_other_user = [guid]::NewGuid()
    key_snapshot = [guid]::NewGuid()
    key_snapshot_after = [guid]::NewGuid()
}
$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "run_id=$RunId" -v "user_a_id=$userA" -v "user_b_id=$userB" -v "key_gemn=$($keys.key_gemn)" -v "key_real=$($keys.key_real)" -v "key_mixed=$($keys.key_mixed)" -v "key_other_user=$($keys.key_other_user)" -v "key_snapshot=$($keys.key_snapshot)" -v "key_snapshot_after=$($keys.key_snapshot_after)" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "create_order GEMN tests failed: $($result -join [Environment]::NewLine)"
}
$result | Write-Output
Write-Output "SPRINT24B_CREATE_ORDER_GEMN_OK"

