[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$setupPath = Join-Path $PSScriptRoot 'sprint24c_cancellation_requests_concurrency.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    return [guid]($response.Content | ConvertFrom-Json).user.id
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
        return @(Receive-Job -Job $jobs)
    }
    finally {
        Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
    }
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) { throw "Local Supabase container '$container' is not running." }

$password = "GEMN-S24C-CONC-$RunId-Pass!"
$admin = Invoke-LocalAuth -Email "gemn.s24c.conc.$RunId.admin@example.test" -Password $password
$buyer = Invoke-LocalAuth -Email "gemn.s24c.conc.$RunId.buyer@example.test" -Password $password
$seller = Invoke-LocalAuth -Email "gemn.s24c.conc.$RunId.seller@example.test" -Password $password

$setupSql = Get-Content -LiteralPath $setupPath -Raw
$setupOutput = $setupSql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "admin_id=$admin" -v "buyer_id=$buyer" -v "seller_id=$seller" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Concurrency setup failed: $($setupOutput -join [Environment]::NewLine)" }

$lines = @($setupOutput | ForEach-Object { "$_" })
function Get-TagValue {
    param([Parameter(Mandatory)][string]$Tag)
    $line = $lines | Where-Object { $_ -like "$Tag=*" } | Select-Object -First 1
    if (-not $line) { throw "Missing setup tag '$Tag'." }
    return ($line -replace "^$Tag=", '')
}

$orderId = Get-TagValue 'ORDER_ID'
$requestKey = Get-TagValue 'REQUEST_KEY'
$approvalKey = Get-TagValue 'APPROVAL_KEY'

$requestSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$buyer', true);
select * from public.request_order_cancellation('$orderId'::uuid, '$requestKey'::uuid, 'corrida de solicitacao');
commit;
"@
$requestResults = Invoke-ParallelSql @($requestSql, $requestSql)
if (($requestResults | Where-Object { $_.Output -match 'ERROR:' }).Count -gt 0) { throw "Concurrent request failed: $($requestResults.Output -join ' | ')" }

$requestIdSql = "select id from public.order_cancellation_requests where order_id = '$orderId'::uuid and status = 'pendente';"
$requestIdOutput = $requestIdSql | & docker exec -i $container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 2>&1
if ($LASTEXITCODE -ne 0) { throw "Could not find concurrent request: $($requestIdOutput -join [Environment]::NewLine)" }
$requestId = ($requestIdOutput | Select-Object -First 1).ToString().Trim()

$approvalSql = @"
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$admin', true);
select * from public.approve_order_cancellation_request('$requestId'::uuid, '$approvalKey'::uuid);
commit;
"@
$approvalResults = Invoke-ParallelSql @($approvalSql, $approvalSql)
if (($approvalResults | Where-Object { $_.Output -match 'ERROR:' }).Count -gt 0) { throw "Concurrent approval failed: $($approvalResults.Output -join ' | ')" }

$postSql = @"
select 'REQUEST_COUNT=' || count(*) from public.order_cancellation_requests where order_id = '$orderId'::uuid;
select 'ATTEMPT_COUNT=' || count(*) from public.order_cancellation_request_attempts a join public.order_cancellation_requests r on r.id = a.request_id where r.order_id = '$orderId'::uuid;
select 'CANCELLATION_COUNT=' || count(*) from public.order_cancellations where order_id = '$orderId'::uuid;
select 'ORDER_STATUS=' || status from public.orders where id = '$orderId'::uuid;
"@
$post = $postSql | & docker exec -i $container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 2>&1
if ($LASTEXITCODE -ne 0) { throw "Post-concurrency query failed: $($post -join [Environment]::NewLine)" }
$post
if (($post -notcontains 'REQUEST_COUNT=1') -or ($post -notcontains 'ATTEMPT_COUNT=1') -or ($post -notcontains 'CANCELLATION_COUNT=1') -or ($post -notcontains 'ORDER_STATUS=cancelado')) { throw "Concurrent request/approval integrity failed: $($post -join ' | ')" }
Write-Output 'SPRINT24C_CANCELLATION_REQUESTS_CONCURRENCY_OK'
