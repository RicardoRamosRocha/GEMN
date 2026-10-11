[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24c_seller_cancellation_reads.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    return [guid]($response.Content | ConvertFrom-Json).user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) { throw "Local Supabase container '$container' is not running." }

$password = "GEMN-S24C-SELLER-READ-$RunId-Pass!"
$buyer = Invoke-LocalAuth -Email "gemn.s24c.seller-read.$RunId.buyer@example.test" -Password $password
$sellerA = Invoke-LocalAuth -Email "gemn.s24c.seller-read.$RunId.seller-a@example.test" -Password $password
$sellerB = Invoke-LocalAuth -Email "gemn.s24c.seller-read.$RunId.seller-b@example.test" -Password $password
$outsider = Invoke-LocalAuth -Email "gemn.s24c.seller-read.$RunId.outsider@example.test" -Password $password

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "buyer_id=$buyer" -v "seller_a_user_id=$sellerA" `
    -v "seller_b_user_id=$sellerB" -v "outsider_id=$outsider" 2>&1

if ($LASTEXITCODE -ne 0) { throw "Seller cancellation read tests failed: $($result -join [Environment]::NewLine)" }
$result
