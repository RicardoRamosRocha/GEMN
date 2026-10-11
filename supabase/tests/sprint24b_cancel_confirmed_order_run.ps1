[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_cancel_confirmed_order.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    $parsed = $response.Content | ConvertFrom-Json
    return [guid]$parsed.user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) { throw "Local Supabase container '$container' is not running." }

$password = "GEMN-S24B2C-$RunId-Pass!"
$userA = Invoke-LocalAuth -Email "gemn.s24b2c.$RunId.admin@example.test" -Password $password
$userB = Invoke-LocalAuth -Email "gemn.s24b2c.$RunId.buyer@example.test" -Password $password

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "run_id=$RunId" -v "user_a_id=$userA" -v "user_b_id=$userB" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Confirmed order cancellation tests failed: $($result -join [Environment]::NewLine)" }
$result
