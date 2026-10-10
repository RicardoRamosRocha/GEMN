[CmdletBinding()]
param(
    [string]$RunId = "$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString('N').Substring(0, 8))"
)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_gemn'
$apiBase = 'http://127.0.0.1:54321'
$fixturePath = Join-Path $PSScriptRoot 'sprint22_fixtures.sql'

function Invoke-LocalSql {
    param([Parameter(Mandatory)][string]$Sql)

    $result = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -F "`t" -c $Sql 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Local SQL failed: $($result -join [Environment]::NewLine)"
    }
    return ($result -join [Environment]::NewLine)
}

function Invoke-FixtureSql {
    $sql = Get-Content -LiteralPath $fixturePath -Raw
    $result = $sql | & docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "run_id=$RunId" -v "buyer_a_email=$emailA" -v "buyer_b_email=$emailB" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture SQL failed: $($result -join [Environment]::NewLine)"
    }
    Write-Output ($result -join [Environment]::NewLine)
}

function Invoke-LocalAuth {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Body
    )

    $json = $Body | ConvertTo-Json -Compress
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$apiBase/auth/v1/$Path" -Method Post -ContentType 'application/json' -Body $json
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $response.Content | ConvertFrom-Json
            Raw = $response.Content
        }
    } catch {
        $raw = ''
        if ($_.Exception.Response) {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
        }
        throw "Auth request failed ($Path): $raw"
    }
}

function New-LocalUser {
    param([Parameter(Mandatory)][string]$Email)

    $response = Invoke-LocalAuth -Path 'signup' -Body @{
        email = $Email
        password = $password
    }

    if (-not $response.Body.access_token) {
        throw "Auth signup did not return an access token for $Email"
    }

    return [pscustomobject]@{
        Id = [guid]$response.Body.user.id
        Email = $Email
        Token = $response.Body.access_token
    }
}

function Invoke-Rest {
    param(
        [Parameter(Mandatory)][ValidateSet('GET','POST','PATCH','DELETE')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [string]$Token,
        [object]$Body
    )

    $headers = @{}
    if ($Token) {
        $headers.Authorization = "Bearer $Token"
    }

    $params = @{
        UseBasicParsing = $true
        Uri = "$apiBase$Path"
        Method = $Method
        Headers = $headers
    }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = $Body | ConvertTo-Json -Compress
    }

    try {
        $response = Invoke-WebRequest @params
        $parsed = $null
        if ($response.Content) {
            try { $parsed = $response.Content | ConvertFrom-Json } catch { }
        }
        return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Body = $parsed; Raw = $response.Content }
    } catch {
        $status = 0
        $raw = ''
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
        }
        return [pscustomobject]@{ StatusCode = $status; Body = $null; Raw = $raw }
    }
}

$results = [System.Collections.Generic.List[object]]::new()
function Assert-Test {
    param([string]$Name, [bool]$Passed, [string]$Detail)
    $results.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Detail = $Detail })
    if ($Passed) { Write-Output "PASS`t$Name`t$Detail" }
    else { Write-Output "FAIL`t$Name`t$Detail" }
}

$emailA = "gemn.s22.$RunId.a@example.test"
$emailB = "gemn.s22.$RunId.b@example.test"
$password = "GEMN-S22-$RunId-Pass!"
$keySequential = [guid]::NewGuid()
$keyConflict = [guid]::NewGuid()
$keyConcurrent = [guid]::NewGuid()

Write-Output "RUN_ID=$RunId"
Write-Output "BUYER_A=$emailA"
Write-Output "BUYER_B=$emailB"

$buyerA = New-LocalUser -Email $emailA
$buyerB = New-LocalUser -Email $emailB
Invoke-FixtureSql | Out-Host

$listingReal = [guid](Invoke-LocalSql "select id from public.listings where nome = 'GEMN_S22_${RunId}_ACTIVE_REAL';")
$listingGemn = [guid](Invoke-LocalSql "select id from public.listings where nome = 'GEMN_S22_${RunId}_ACTIVE_GEMN';")
$listingInactive = [guid](Invoke-LocalSql "select id from public.listings where nome = 'GEMN_S22_${RunId}_INACTIVE';")
$listingSuspended = [guid](Invoke-LocalSql "select id from public.listings where nome = 'GEMN_S22_${RunId}_SUSPENDED_SELLER';")

$valid = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingReal
    p_quantidade = 2
    p_forma_pagamento = 'real'
    p_idempotency_key = $keySequential
}
$validRow = @($valid.Body)[0]
$orderId = [guid]$validRow.order_id
Assert-Test 'valid order is pending' ($valid.StatusCode -in 200,201 -and $validRow.status -eq 'pendente') "status=$($validRow.status)"
Assert-Test 'server calculates total' ($validRow.total_real -eq 25.00 -and $validRow.total_gemn -eq $null) "total_real=$($validRow.total_real)"

$dbCheck = Invoke-LocalSql "select o.total_real::text || '|' || oi.preco_real_unitario::text || '|' || oi.subtotal_real::text || '|' || count(*)::text from public.orders o join public.order_items oi on oi.order_id=o.id where o.id='$orderId' group by o.total_real, oi.preco_real_unitario, oi.subtotal_real;"
Assert-Test 'snapshot and one item persisted' ($dbCheck -eq '25.00|12.50|25.00|1') $dbCheck

$retry = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingReal
    p_quantidade = 2
    p_forma_pagamento = 'real'
    p_idempotency_key = $keySequential
}
$retryRow = @($retry.Body)[0]
Assert-Test 'same idempotency retry returns same order' ($retry.StatusCode -in 200,201 -and $retryRow.order_id -eq $orderId) "order_id=$($retryRow.order_id)"

Invoke-LocalSql "update public.listings set preco_real = 99.99 where id = '$listingReal';" | Out-Null
$retryAfterPrice = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingReal
    p_quantidade = 2
    p_forma_pagamento = 'real'
    p_idempotency_key = $keySequential
}
$retryAfterPriceRow = @($retryAfterPrice.Body)[0]
Assert-Test 'retry ignores later listing price change' ($retryAfterPrice.StatusCode -in 200,201 -and $retryAfterPriceRow.order_id -eq $orderId -and $retryAfterPriceRow.total_real -eq 25.00) "total_real=$($retryAfterPriceRow.total_real)"

$conflict = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingReal
    p_quantidade = 3
    p_forma_pagamento = 'real'
    p_idempotency_key = $keySequential
}
Assert-Test 'same key with different parameters is rejected' ($conflict.StatusCode -ge 400) "http=$($conflict.StatusCode)"

$inactive = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingInactive
    p_quantidade = 1
    p_forma_pagamento = 'real'
    p_idempotency_key = [guid]::NewGuid()
}
Assert-Test 'inactive listing rejected' ($inactive.StatusCode -ge 400) "http=$($inactive.StatusCode)"

$suspended = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Token $buyerA.Token -Body @{
    p_listing_id = $listingSuspended
    p_quantidade = 1
    p_forma_pagamento = 'real'
    p_idempotency_key = [guid]::NewGuid()
}
Assert-Test 'suspended seller rejected' ($suspended.StatusCode -ge 400) "http=$($suspended.StatusCode)"

$unauthenticated = Invoke-Rest -Method POST -Path '/rest/v1/rpc/create_order' -Body @{
    p_listing_id = $listingReal
    p_quantidade = 1
    p_forma_pagamento = 'real'
    p_idempotency_key = [guid]::NewGuid()
}
Assert-Test 'unauthenticated request rejected' ($unauthenticated.StatusCode -ge 401) "http=$($unauthenticated.StatusCode)"

$crossRead = Invoke-Rest -Method GET -Path "/rest/v1/orders?id=eq.$orderId&select=id,buyer_id" -Token $buyerB.Token
Assert-Test 'buyer cannot read another buyer order' ($crossRead.StatusCode -eq 200 -and @($crossRead.Body).Count -eq 0) "http=$($crossRead.StatusCode) rows=$(@($crossRead.Body).Count)"

$directInsert = Invoke-Rest -Method POST -Path '/rest/v1/orders' -Token $buyerA.Token -Body @{
    buyer_id = $buyerA.Id
    idempotency_key = [guid]::NewGuid()
    status = 'pendente'
    forma_pagamento = 'real'
    total_real = 1.00
}
Assert-Test 'direct orders insert rejected' ($directInsert.StatusCode -ge 400) "http=$($directInsert.StatusCode)"

$directUpdate = Invoke-Rest -Method PATCH -Path "/rest/v1/orders?id=eq.$orderId" -Token $buyerA.Token -Body @{ status = 'confirmado' }
Assert-Test 'direct orders update rejected' ($directUpdate.StatusCode -ge 400) "http=$($directUpdate.StatusCode)"

$directDelete = Invoke-Rest -Method DELETE -Path "/rest/v1/order_items?order_id=eq.$orderId" -Token $buyerA.Token
Assert-Test 'direct order item delete rejected' ($directDelete.StatusCode -ge 400) "http=$($directDelete.StatusCode)"

$jobScript = {
    param($base, $token, $listing, $payment, $key)
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ p_listing_id = $listing; p_quantidade = 1; p_forma_pagamento = $payment; p_idempotency_key = $key } | ConvertTo-Json -Compress
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$base/rest/v1/rpc/create_order" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
        [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Raw = $response.Content }
    } catch {
        $raw = ''
        if ($_.Exception.Response) {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
        }
        [pscustomobject]@{ StatusCode = 0; Raw = $raw }
    }
}

$jobA = Start-Job -ScriptBlock $jobScript -ArgumentList $apiBase, $buyerA.Token, $listingGemn, 'gemn', $keyConcurrent
$jobB = Start-Job -ScriptBlock $jobScript -ArgumentList $apiBase, $buyerA.Token, $listingGemn, 'gemn', $keyConcurrent
Wait-Job $jobA, $jobB | Out-Null
$concurrentResults = @(Receive-Job $jobA), @(Receive-Job $jobB)
Remove-Job $jobA, $jobB -Force
$concurrentRows = @($concurrentResults | Where-Object { $_.StatusCode -in 200,201 } | ForEach-Object { $_.Raw | ConvertFrom-Json })
$concurrentOrderIds = @($concurrentRows | ForEach-Object { @($_)[0].order_id } | Select-Object -Unique)
$concurrentCount = Invoke-LocalSql "select count(*) from public.orders where buyer_id='$($buyerA.Id)' and idempotency_key='$keyConcurrent';"
Assert-Test 'concurrent same-key calls produce one order' ($concurrentRows.Count -eq 2 -and $concurrentOrderIds.Count -eq 1 -and $concurrentCount -eq '1') "responses=$($concurrentRows.Count) unique_order_ids=$($concurrentOrderIds.Count) db_rows=$concurrentCount"
$gemnCheck = Invoke-LocalSql "select total_real::text || '|' || total_gemn::text || '|' || status from public.orders where buyer_id='$($buyerA.Id)' and idempotency_key='$keyConcurrent';"
Assert-Test 'GEMN payment snapshot is calculated without payment processing' ($gemnCheck -eq '20.00|7.50|pendente') $gemnCheck

$passed = @($results | Where-Object Passed).Count
$failed = @($results | Where-Object { -not $_.Passed }).Count
Write-Output "SUMMARY`tpassed=$passed`tfailed=$failed`torders_retained_for_history=2"
if ($failed -gt 0) { exit 1 }
