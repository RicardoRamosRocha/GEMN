[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24c_cancellation_requests_model.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    return [guid]($response.Content | ConvertFrom-Json).user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) { throw "Local Supabase container '$container' is not running." }

$password = "GEMN-S24C-$RunId-Pass!"
$admin = Invoke-LocalAuth -Email "gemn.s24c.$RunId.admin@example.test" -Password $password
$buyer = Invoke-LocalAuth -Email "gemn.s24c.$RunId.buyer@example.test" -Password $password
$sellerUser = Invoke-LocalAuth -Email "gemn.s24c.$RunId.seller@example.test" -Password $password
$otherSellerUser = Invoke-LocalAuth -Email "gemn.s24c.$RunId.other-seller@example.test" -Password $password
$otherUser = Invoke-LocalAuth -Email "gemn.s24c.$RunId.other@example.test" -Password $password

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "admin_id=$admin" -v "buyer_id=$buyer" `
    -v "seller_user_id=$sellerUser" -v "other_seller_user_id=$otherSellerUser" `
    -v "other_user_id=$otherUser" 2>&1

if ($LASTEXITCODE -ne 0) { throw "Cancellation request model tests failed: $($result -join [Environment]::NewLine)" }
$result
