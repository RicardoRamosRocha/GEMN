[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_confirm_order.sql'

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

$password = "GEMN-S24B-4A-$RunId-Pass!"
$buyer = New-LocalUser "gemn.s24b.4a.$RunId.buyer@example.test" $password
$seller = New-LocalUser "gemn.s24b.4a.$RunId.seller@example.test" $password
$admin = New-LocalUser "gemn.s24b.4a.$RunId.admin@example.test" $password
$keys = @{
    key_real = [guid]::NewGuid()
    key_mixed = [guid]::NewGuid()
    key_gemn = [guid]::NewGuid()
    key_recovery = [guid]::NewGuid()
    key_concurrent = [guid]::NewGuid()
}

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "buyer_id=$buyer" -v "seller_user_id=$seller" -v "admin_id=$admin" `
    -v "key_real=$($keys.key_real)" -v "key_mixed=$($keys.key_mixed)" -v "key_gemn=$($keys.key_gemn)" `
    -v "key_recovery=$($keys.key_recovery)" -v "key_concurrent=$($keys.key_concurrent)" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Administrative confirmation tests failed: $($result -join [Environment]::NewLine)"
}
$result | Write-Output

$listing = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select id from public.listings where nome='GEMN_4A_TARGET_$RunId';").Trim()
$concurrentKey = [guid]::NewGuid()
$orderOutput = @(& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select set_config('request.jwt.claim.sub', '$buyer', false); set role authenticated; select order_id from public.create_order('$listing', 1, 'real', '$concurrentKey', 0.00);")
$order = ($orderOutput | Where-Object { $_ -match '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } | Select-Object -Last 1).Trim()
if (-not $order) { throw 'Could not create concurrent confirmation fixture.' }

$keyA = [guid]::NewGuid()
$keyB = [guid]::NewGuid()
$jobScript = {
    param($dbContainer, $adminId, $orderId, $key)
    $sql = "select set_config('request.jwt.claim.sub', '$adminId', false); set role authenticated; select public.confirm_order_payment('$orderId', '$key');"
    $raw = & docker exec $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $sql 2>&1
    [pscustomobject]@{ StatusCode = $LASTEXITCODE; Raw = ($raw -join [Environment]::NewLine) }
}
$jobA = Start-Job -ScriptBlock $jobScript -ArgumentList $container, $admin, $order, $keyA
$jobB = Start-Job -ScriptBlock $jobScript -ArgumentList $container, $admin, $order, $keyB
Wait-Job $jobA, $jobB | Out-Null
$concurrent = @(Receive-Job $jobA), @(Receive-Job $jobB)
Remove-Job $jobA, $jobB -Force
$successful = @($concurrent | Where-Object { $_.StatusCode -eq 0 })
if ($successful.Count -ne 1) { throw "Concurrent confirmation expected exactly one success: $($concurrent | ConvertTo-Json -Compress)" }
$ledgerCount = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select count(*) from public.wallet_transactions where order_id='$order';").Trim()
if ($ledgerCount -ne '1') { throw "Concurrent confirmation ledger duplication: $ledgerCount" }
Write-Output "PASS concurrent confirmation: one success / one rejection"
Write-Output "SPRINT24B_CONFIRM_ORDER_OK"
