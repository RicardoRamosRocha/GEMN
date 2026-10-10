[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_cancel_expiration.sql'

function New-LocalUser {
    param([string]$Email, [string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post `
        -ContentType 'application/json' -Body $body
    [guid]($response.Content | ConvertFrom-Json).user.id
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) {
    throw "Local Supabase container '$container' is not running."
}

$password = "GEMN-S24B-4B1-$RunId-Pass!"
$buyer = New-LocalUser "gemn.s24b.4b1.$RunId.buyer@example.test" $password
$otherBuyer = New-LocalUser "gemn.s24b.4b1.$RunId.other@example.test" $password
$seller = New-LocalUser "gemn.s24b.4b1.$RunId.seller@example.test" $password
$admin = New-LocalUser "gemn.s24b.4b1.$RunId.admin@example.test" $password
$cancelKey = [guid]::NewGuid()

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose `
    -v "run_id=$RunId" -v "buyer_id=$buyer" -v "other_buyer_id=$otherBuyer" `
    -v "seller_user_id=$seller" -v "admin_id=$admin" -v "cancel_key=$cancelKey" 2>&1
if ($LASTEXITCODE -ne 0) {
    $result | Write-Output
    throw "Cancellation/expiration tests failed: $($result -join [Environment]::NewLine)"
}
$result | Write-Output

# Corrida entre o scheduler e a confirmação administrativa no mesmo pedido.
$listing = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At `
    -c "select id from public.listings where nome='GEMN_4B1_TARGET_$RunId';").Trim()
$orderRaw = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c `
    "select set_config('request.jwt.claim.sub', '$buyer', false); set role authenticated; select order_id from public.create_order('$listing', 1, 'real', gen_random_uuid());"
$order = ($orderRaw | Where-Object { $_ -match '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } | Select-Object -Last 1).Trim()
if (-not $order) { throw 'Could not create concurrency fixture.' }
& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c `
    "update public.orders set criado_em = clock_timestamp() - interval '24 hours' where id='$order';" | Out-Null

$expireJob = {
    param($dbContainer)
    $raw = & docker exec $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c `
        "set role service_role; select public.expire_pending_orders(100);"
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Raw = ($raw -join [Environment]::NewLine) }
}
$confirmJob = {
    param($dbContainer, $adminId, $orderId)
    $raw = & docker exec $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c `
        "select set_config('request.jwt.claim.sub', '$adminId', false); set role authenticated; select public.confirm_order_payment('$orderId', gen_random_uuid());"
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Raw = ($raw -join [Environment]::NewLine) }
}
$jobExpire = Start-Job -ScriptBlock $expireJob -ArgumentList $container
$jobConfirm = Start-Job -ScriptBlock $confirmJob -ArgumentList $container, $admin, $order
Wait-Job $jobExpire, $jobConfirm | Out-Null
$race = @(Receive-Job $jobExpire -ErrorAction SilentlyContinue), @(Receive-Job $jobConfirm -ErrorAction SilentlyContinue)
Remove-Job $jobExpire, $jobConfirm -Force
if (($race | Where-Object { $_.ExitCode -eq 0 }).Count -lt 1) {
    throw "Expiration/confirmation race had no successful finalizer: $($race | ConvertTo-Json -Compress)"
}
$finalStatus = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At `
    -c "select status from public.orders where id='$order';").Trim()
if ($finalStatus -ne 'expirado') { throw "Race fixture ended with unexpected status: $finalStatus" }
Write-Output "PASS expiration/confirmation race: final status expirado"
Write-Output "SPRINT24B_CANCEL_EXPIRATION_CONCURRENCY_OK"
