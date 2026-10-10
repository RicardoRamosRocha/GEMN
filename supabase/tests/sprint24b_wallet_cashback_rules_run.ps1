[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$testPath = Join-Path $PSScriptRoot 'sprint24b_wallet_cashback_rules.sql'

function Invoke-LocalAuth {
    param([Parameter(Mandatory)][string]$Email, [Parameter(Mandatory)][string]$Password)
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/signup" -Method Post -ContentType 'application/json' -Body $body
    $parsed = $response.Content | ConvertFrom-Json
    if (-not $parsed.user.id -or -not $parsed.access_token) { throw "Auth signup did not return a user/token for $Email" }
    return [pscustomobject]@{ Id = [guid]$parsed.user.id; Token = $parsed.access_token }
}

function Invoke-Rpc {
    param(
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$Percentual,
        [Parameter(Mandatory)][guid]$Key
    )
    $headers = @{ Authorization = "Bearer $Token" }
    $body = @{ p_percentual = [decimal]$Percentual; p_idempotency_key = $Key } | ConvertTo-Json -Compress
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/rest/v1/rpc/set_seller_cashback" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
        return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Raw = $response.Content }
    } catch {
        $raw = ''
        if ($_.Exception.Response) {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
        }
        return [pscustomobject]@{ StatusCode = 0; Raw = $raw }
    }
}

function Invoke-LocalSql {
    param([Parameter(Mandatory)][string]$Sql)
    $result = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Local SQL failed: $($result -join [Environment]::NewLine)" }
    return ($result -join [Environment]::NewLine)
}

if (-not (docker ps --format '{{.Names}}' | Select-String -SimpleMatch $container)) {
    throw "Local Supabase container '$container' is not running."
}

$emailA = "gemn.s24b.rules.$RunId.a@example.test"
$emailB = "gemn.s24b.rules.$RunId.b@example.test"
$password = "GEMN-S24B-RULES-$RunId-Pass!"
$userA = Invoke-LocalAuth -Email $emailA -Password $password
$userB = Invoke-LocalAuth -Email $emailB -Password $password

$sql = Get-Content -LiteralPath $testPath -Raw
$result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -v "run_id=$RunId" -v "user_a_id=$($userA.Id)" -v "user_b_id=$($userB.Id)" 2>&1
if ($LASTEXITCODE -ne 0) { throw "Sequential wallet/cashback tests failed: $($result -join [Environment]::NewLine)" }
$result | Write-Output

$sellerA = [guid](Invoke-LocalSql "select id from public.sellers where user_id='$($userA.Id)';")

$jobScript = {
    param($base, $token, $percentual, $key)
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ p_percentual = [decimal]$percentual; p_idempotency_key = $key } | ConvertTo-Json -Compress
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$base/rest/v1/rpc/set_seller_cashback" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
        [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Raw = $response.Content }
    } catch {
        [pscustomobject]@{ StatusCode = 0; Raw = '' }
    }
}

$keyA = [guid]::NewGuid()
$keyB = [guid]::NewGuid()
$jobA = Start-Job -ScriptBlock $jobScript -ArgumentList $apiBase, $userA.Token, '11.00', $keyA
$jobB = Start-Job -ScriptBlock $jobScript -ArgumentList $apiBase, $userA.Token, '12.00', $keyB
Wait-Job $jobA, $jobB | Out-Null
$concurrent = @(Receive-Job $jobA), @(Receive-Job $jobB)
Remove-Job $jobA, $jobB -Force

$successful = @($concurrent | Where-Object { $_.StatusCode -in 200,201 })
if ($successful.Count -ne 2) {
    throw "Concurrent cashback configuration failed: $($concurrent | ConvertTo-Json -Compress)"
}

$currentCount = Invoke-LocalSql "select count(*) from public.cashback_rules where seller_id='$sellerA' and vigente_ate is null;"
$historyCount = Invoke-LocalSql "select count(*) from public.cashback_rules where seller_id='$sellerA';"
if ($currentCount -ne '1' -or $historyCount -ne '6') {
    throw "Concurrent cashback configuration integrity failed: current=$currentCount history=$historyCount"
}

Write-Output "PASS`tconcurrent cashback configuration`tcurrent=$currentCount history=$historyCount"
Write-Output "SPRINT24B_WALLET_CASHBACK_RULES_CONCURRENCY_OK"
