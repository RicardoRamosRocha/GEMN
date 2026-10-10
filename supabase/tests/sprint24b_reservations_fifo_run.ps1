[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_reservations_fifo.sql'

function Invoke-LocalAuth {
    param([string]$Email, [string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    $parsed = $response.Content | ConvertFrom-Json
    [pscustomobject]@{ Id = [guid]$parsed.user.id; Token = $parsed.access_token }
}

function Invoke-LocalSql {
    param([string]$Sql)
    $result = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Local SQL failed: $($result -join [Environment]::NewLine)" }
    ($result -join [Environment]::NewLine).Trim()
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) {
    throw "Local Supabase container '$container' is not running."
}

$emailA = "gemn.s24b.reservation.$RunId.a@example.test"
$emailB = "gemn.s24b.reservation.$RunId.b@example.test"
$password = "GEMN-S24B-RES-$RunId-Pass!"
$userA = Invoke-LocalAuth $emailA $password
$userB = Invoke-LocalAuth $emailB $password

$reserveKey = [guid]::NewGuid()
$releaseKey = [guid]::NewGuid()
$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "run_id=$RunId" -v "user_a_id=$($userA.Id)" -v "user_b_id=$($userB.Id)" -v "reserve_key=$reserveKey" -v "release_key=$releaseKey" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Sequential reservation tests failed: $($result -join [Environment]::NewLine)" }
$result | Write-Output

$allFixtureOrders = @(Invoke-LocalSql "select id from public.orders where buyer_id='$($userA.Id)' order by criado_em, id;").Split([Environment]::NewLine) | Where-Object { $_ }
if ($allFixtureOrders.Count -ne 5) { throw "Expected five fixture orders, got $($allFixtureOrders.Count)" }
$orderIds = @($allFixtureOrders[2], $allFixtureOrders[3])

$keyA = [guid]::NewGuid()
$keyB = [guid]::NewGuid()
$jobScript = {
    param($dbContainer, $userId, $order, $key)
    $sql = "select set_config('request.jwt.claim.sub', '$userId', false); set role service_role; select public.reserve_gemn_for_order('$order', 6.00, '$key', null);"
    $raw = & docker exec $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $sql 2>&1
    [pscustomobject]@{ StatusCode = $LASTEXITCODE; Raw = ($raw -join [Environment]::NewLine) }
}
$jobA = Start-Job -ScriptBlock $jobScript -ArgumentList $container, $userA.Id, $orderIds[0], $keyA
$jobB = Start-Job -ScriptBlock $jobScript -ArgumentList $container, $userA.Id, $orderIds[1], $keyB
Wait-Job $jobA, $jobB | Out-Null
$concurrent = @(Receive-Job $jobA), @(Receive-Job $jobB)
Remove-Job $jobA, $jobB -Force
$successful = @($concurrent | Where-Object { $_.StatusCode -eq 0 })
if ($successful.Count -ne 1) { throw "Concurrent reservation expected exactly one success: $($concurrent | ConvertTo-Json -Compress)" }
Write-Output "PASS concurrent same-wallet reservation: one success / one rejection"

$winnerOrder = if ($concurrent[0].StatusCode -eq 0) { $orderIds[0] } else { $orderIds[1] }
$winnerReservation = Invoke-LocalSql "select id from public.gemn_reservations where order_id='$winnerOrder';"
$releaseOutput = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select public.release_gemn_reservation('$winnerReservation', 'cancelamento', '$releaseKey');" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Administrative release failed: $($releaseOutput -join [Environment]::NewLine)" }
$duplicateOutput = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select public.release_gemn_reservation('$winnerReservation', 'cancelamento', '$releaseKey');" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Idempotent release retry failed: $($duplicateOutput -join [Environment]::NewLine)" }

$wallet = Invoke-LocalSql "select id from public.wallets where user_id='$($userA.Id)';"
$integrity = Invoke-LocalSql "select saldo_disponivel || '|' || saldo_reservado from public.wallets where id='$wallet';"
if ($integrity -ne '10.00|0.00') { throw "Wallet release integrity failed: $integrity" }
$releaseCount = Invoke-LocalSql "select count(*) from public.wallet_transactions where reservation_id='$winnerReservation' and tipo='liberacao_reserva';"
if ($releaseCount -ne '1') { throw "Release ledger idempotency failed: $releaseCount" }
Write-Output "PASS release, duplicate release and ledger idempotency"
Write-Output "SPRINT24B_RESERVATIONS_FIFO_OK"

