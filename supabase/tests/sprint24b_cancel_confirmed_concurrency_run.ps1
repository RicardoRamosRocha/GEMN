[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_cancel_confirmed_concurrency.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    return [guid]($response.Content | ConvertFrom-Json).user.id
}

function Invoke-LocalSql {
    param([Parameter(Mandatory)][string]$Sql)
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = $Sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1
        [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
}

function Invoke-ParallelSql {
    param([Parameter(Mandatory)][string[]]$Sql)
    $jobs = foreach ($statement in $Sql) {
        Start-Job -ScriptBlock {
            param($ContainerName, $Statement)
            $output = $Statement | & docker exec -i $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1
            [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
        } -ArgumentList $container, $statement
    }

    try {
        if (-not (Wait-Job -Job $jobs -Timeout 30)) { throw 'Concurrency test timed out (possible deadlock).' }
        $results = @(Receive-Job -Job $jobs)
        if ($results.Count -ne $Sql.Count) { throw 'Concurrency test did not return one result per connection.' }
        return $results
    }
    finally {
        Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
    }
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) { throw "Local Supabase container '$container' is not running." }

$password = "GEMN-S24B2C-CONC-$RunId-Pass!"
$userA = Invoke-LocalAuth -Email "gemn.s24b2c.conc.$RunId.admin@example.test" -Password $password
$userB = Invoke-LocalAuth -Email "gemn.s24b2c.conc.$RunId.buyer@example.test" -Password $password

$setupSql = Get-Content -LiteralPath $testPath -Raw
# Execute the fixture transaction with psql variables.
$setupOutput = $setupSql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "run_id=$RunId" -v "user_a_id=$userA" -v "user_b_id=$userB" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Concurrency fixture setup failed: $($setupOutput -join [Environment]::NewLine)" }

$lines = @($setupOutput | ForEach-Object { "$_" })
function Get-TagValue {
    param([Parameter(Mandatory)][string]$Tag)
    $line = $lines | Where-Object { $_ -like "$Tag=*" } | Select-Object -First 1
    if (-not $line) { throw "Missing fixture tag '$Tag'." }
    return ($line -replace "^$Tag=", '')
}

$sameOrder = Get-TagValue 'SAME_ORDER'
$differentOrder = Get-TagValue 'DIFFERENT_ORDER'
$reserveSourceOrder = Get-TagValue 'RESERVE_SOURCE_ORDER'
$reserveOrder = Get-TagValue 'RESERVE_ORDER'
$sharedOrderA = Get-TagValue 'SHARED_ORDER_A'
$sharedOrderB = Get-TagValue 'SHARED_ORDER_B'
$sameKey = Get-TagValue 'SAME_KEY'
$diffKeyA = Get-TagValue 'DIFF_KEY_A'
$diffKeyB = Get-TagValue 'DIFF_KEY_B'
$reserveKey = Get-TagValue 'RESERVE_KEY'
$cancelReserveKey = Get-TagValue 'CANCEL_RESERVE_KEY'

$sameSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$sameOrder'::uuid, '$sameKey'::uuid, 'concorrencia mesma chave');
commit;
"@
$sameResults = Invoke-ParallelSql @($sameSql, $sameSql)
if (($sameResults | Where-Object ExitCode -ne 0).Count -gt 0) { throw "Same-key concurrency failed: $($sameResults.Output -join ' | ')" }

$differentSqlA = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$differentOrder'::uuid, '$diffKeyA'::uuid, 'concorrencia chave A');
commit;
"@
$differentSqlB = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$differentOrder'::uuid, '$diffKeyB'::uuid, 'concorrencia chave B');
commit;
"@
$differentResults = Invoke-ParallelSql @($differentSqlA, $differentSqlB)
$differentSuccesses = @($differentResults | Where-Object { $_.Output -notmatch 'ERROR:' })
$differentRejections = @($differentResults | Where-Object { $_.Output -match 'pedido ja possui cancelamento com outra chave' })
if ($differentSuccesses.Count -ne 1 -or $differentRejections.Count -ne 1) { throw "Different-key concurrency did not produce one success and one deterministic rejection: $($differentResults.Output -join ' | ')" }

$cancelReserveSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$reserveSourceOrder'::uuid, '$cancelReserveKey'::uuid, 'corrida cancelamento reserva');
commit;
"@
$reserveSql = @"
begin;
set local role service_role;
select set_config('request.jwt.claim.sub', '$userB', true);
select * from public.reserve_gemn_for_order('$reserveOrder'::uuid, 2.00, '$reserveKey'::uuid);
commit;
"@
$reserveResults = Invoke-ParallelSql @($cancelReserveSql, $reserveSql)
if (($reserveResults | Where-Object { $_.Output -match 'deadlock detected|timeout' }).Count -gt 0) { throw "Cancellation/reservation race failed: $($reserveResults.Output -join ' | ')" }

$sharedSqlA = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$sharedOrderA'::uuid, gen_random_uuid(), 'estorno compartilhado A');
commit;
"@
$sharedSqlB = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$sharedOrderB'::uuid, gen_random_uuid(), 'estorno compartilhado B');
commit;
"@
$sharedResults = Invoke-ParallelSql @($sharedSqlA, $sharedSqlB)
if (($sharedResults | Where-Object ExitCode -ne 0).Count -gt 0) { throw "Shared-wallet/lot concurrency failed: $($sharedResults.Output -join ' | ')" }

$inverseSourceOrder = Get-TagValue 'INVERSE_SOURCE_ORDER'
$inverseConsumerOrder = Get-TagValue 'INVERSE_CONSUMER_ORDER'
$inverseFirstSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$inverseSourceOrder'::uuid, gen_random_uuid(), 'produtor antes do consumidor');
commit;
"@
$inverseFirst = Invoke-LocalSql $inverseFirstSql
if ($inverseFirst.Output -notmatch 'cashback deste pedido ainda esta consumido') { throw "Inverse cancellation was not blocked by live cashback consumption: $($inverseFirst.Output)" }

$inverseConsumerSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$inverseConsumerOrder'::uuid, gen_random_uuid(), 'consumidor antes do produtor');
commit;
"@
$inverseConsumer = Invoke-LocalSql $inverseConsumerSql
if ($inverseConsumer.ExitCode -ne 0) { throw "Inverse consumer cancellation failed: $($inverseConsumer.Output)" }

$inverseSourceRetrySql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$userA', true);
select * from public.cancel_confirmed_order('$inverseSourceOrder'::uuid, gen_random_uuid(), 'produtor apos consumidor');
commit;
"@
$inverseSourceRetry = Invoke-LocalSql $inverseSourceRetrySql
if ($inverseSourceRetry.ExitCode -ne 0) { throw "Inverse source cancellation after consumer failed: $($inverseSourceRetry.Output)" }

$postSql = @"
with checks as (
    select count(*) filter (where saldo_disponivel < 0 or saldo_reservado < 0 or saldo_a_recuperar < 0) as negative_wallets,
           0::bigint as negative_lots,
           0::bigint as duplicate_ledger,
           0::bigint as duplicate_cancellation_allocations
    from public.wallets
), lot_checks as (
    select count(*) filter (where valor_original < 0 or valor_disponivel < 0 or valor_reservado < 0 or valor_consumido < 0) as negative_lots
    from public.cashback_lots
), ledger_checks as (
    select count(*) as duplicate_ledger
    from (select wallet_id, idempotency_key, tipo from public.wallet_transactions group by wallet_id, idempotency_key, tipo having count(*) > 1) d
), cancellation_checks as (
    select count(*) as duplicate_cancellation_allocations
    from (select order_cancellation_id, reservation_allocation_id from public.order_cancellation_allocations group by order_cancellation_id, reservation_allocation_id having count(*) > 1) d
), target_checks as (
    select count(*) filter (where status <> 'cancelado') as shared_not_cancelled
    from public.orders
    where id in ('$sharedOrderA'::uuid, '$sharedOrderB'::uuid)
), inverse_checks as (
    select count(*) filter (where status <> 'cancelado') as inverse_not_cancelled
    from public.orders
    where id in ('$inverseSourceOrder'::uuid, '$inverseConsumerOrder'::uuid)
)
select 'NEGATIVE_WALLETS=' || c.negative_wallets,
       'NEGATIVE_LOTS=' || l.negative_lots,
       'DUPLICATE_LEDGER=' || g.duplicate_ledger,
       'DUPLICATE_CANCELLATION_ALLOCATIONS=' || a.duplicate_cancellation_allocations,
       'SHARED_NOT_CANCELLED=' || t.shared_not_cancelled,
       'INVERSE_NOT_CANCELLED=' || i.inverse_not_cancelled
from checks c, lot_checks l, ledger_checks g, cancellation_checks a, target_checks t, inverse_checks i;
"@
$post = Invoke-LocalSql $postSql
if ($post.ExitCode -ne 0) { throw "Post-concurrency integrity query failed: $($post.Output)" }
if ($post.Output -match 'NEGATIVE_WALLETS=[1-9]|NEGATIVE_LOTS=[1-9]|DUPLICATE_LEDGER=[1-9]|DUPLICATE_CANCELLATION_ALLOCATIONS=[1-9]|SHARED_NOT_CANCELLED=[1-9]|INVERSE_NOT_CANCELLED=[1-9]') { throw "Post-concurrency integrity checks failed: $($post.Output)" }

$post.Output
Write-Output 'SPRINT24B_CANCEL_CONFIRMED_CONCURRENCY_OK'
