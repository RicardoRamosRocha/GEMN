[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$apiBase = 'http://127.0.0.1:54321'
$container = 'supabase_db_gemn'
$runId = [guid]::NewGuid().ToString('N')
$password = "GEMN_Local_$([guid]::NewGuid().ToString('N'))!"
$serviceRoleKey = $env:GEMN_LOCAL_SUPABASE_SERVICE_ROLE_KEY
$testPath = Join-Path $PSScriptRoot '..\supabase\tests\sprint31d_seller_profile.sql'

$createdUserIds = [System.Collections.Generic.List[guid]]::new()
$expectedEmails = @(
    "gemn.s31d.$runId.a@example.test",
    "gemn.s31d.$runId.b@example.test",
    "gemn.s31d.$runId.buyer@example.test"
)
$errors = [System.Collections.Generic.List[string]]::new()
$testOutput = @()
$verificationOutput = @()

function ConvertTo-SafeText {
    param([AllowNull()][object]$Value)

    $text = [string]($Value -join [Environment]::NewLine)
    if (-not [string]::IsNullOrEmpty($serviceRoleKey)) {
        $text = $text.Replace($serviceRoleKey, '<redacted-key>')
    }
    if (-not [string]::IsNullOrEmpty($password)) {
        $text = $text.Replace($password, '<redacted-password>')
    }
    return $text -replace '(?i)Bearer\s+\S+', 'Bearer <redacted-token>'
}

function Invoke-LocalAdminRequest {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'DELETE')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [AllowNull()][object]$Body
    )

    $requestParameters = @{
        UseBasicParsing = $true
        Uri = "$apiBase$Path"
        Method = $Method
        Headers = @{
            apikey = $serviceRoleKey
            Authorization = "Bearer $serviceRoleKey"
        }
    }

    if ($null -ne $Body) {
        $requestParameters.ContentType = 'application/json'
        $requestParameters.Body = $Body | ConvertTo-Json -Compress
    }

    try {
        $response = Invoke-WebRequest @requestParameters
        $parsed = $null
        if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
            $parsed = $response.Content | ConvertFrom-Json
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $parsed
        }
    }
    catch {
        throw "Auth Admin API local falhou em $Method $Path."
    }
}

function Get-RunUsers {
    $allUsers = [System.Collections.Generic.List[object]]::new()
    $page = 1
    $perPage = 1000

    do {
        $response = Invoke-LocalAdminRequest -Method GET -Path "/auth/v1/admin/users?page=$page&per_page=$perPage"
        $pageUsers = @($response.Body.users)
        foreach ($user in $pageUsers) {
            if ($null -ne $user -and
                $expectedEmails -contains [string]$user.email -and
                [string]$user.user_metadata.gemn_test_run -eq $runId) {
                $allUsers.Add($user)
            }
        }
        $page++
    } while ($pageUsers.Count -eq $perPage)

    return @($allUsers)
}

function New-LocalTemporaryUser {
    param(
        [Parameter(Mandatory)][string]$Email,
        [Parameter(Mandatory)][string]$Role
    )

    $payload = @{
        email = $Email
        password = $password
        email_confirm = $true
        user_metadata = @{
            gemn_test_run = $runId
            gemn_test_role = $Role
        }
    }

    $response = Invoke-LocalAdminRequest -Method POST -Path '/auth/v1/admin/users' -Body $payload
    $userId = $response.Body.id
    if ([string]::IsNullOrWhiteSpace($userId) -and $null -ne $response.Body.user) {
        $userId = $response.Body.user.id
    }
    if ([string]::IsNullOrWhiteSpace($userId)) {
        throw "A criação de $Email não retornou um ID de usuário."
    }

    return [guid]$userId
}

function Remove-LocalTemporaryUser {
    param([Parameter(Mandatory)][guid]$UserId)

    Invoke-LocalAdminRequest -Method DELETE -Path "/auth/v1/admin/users/$UserId" | Out-Null
}

function Assert-TestContract {
    if (-not (Test-Path -LiteralPath $testPath)) {
        throw "Teste SQL não encontrado: $testPath"
    }

    $testSql = Get-Content -LiteralPath $testPath -Raw
    foreach ($parameter in @('seller_a_user_id', 'seller_b_user_id', 'buyer_id', 'run_id')) {
        $psqlVariable = ":'" + $parameter + "'"
        if ($testSql -notmatch [regex]::Escape($psqlVariable)) {
            throw "O teste SQL não contém o parâmetro esperado: $parameter"
        }
    }
    if ($testSql -notmatch '(?im)^\s*begin\s*;') {
        throw 'O teste SQL não contém BEGIN explícito.'
    }
    if ($testSql -notmatch '(?im)^\s*rollback\s*;') {
        throw 'O teste SQL não contém ROLLBACK explícito.'
    }

    return $testSql
}

if ($apiBase -ne 'http://127.0.0.1:54321') {
    throw 'A API configurada não é exclusivamente a API local autorizada.'
}
if ($container -ne 'supabase_db_gemn') {
    throw 'O container configurado não é o container local autorizado.'
}
if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    throw 'Defina GEMN_LOCAL_SUPABASE_SERVICE_ROLE_KEY com a chave administrativa local.'
}

try {
    $testSql = Assert-TestContract

    $sellerA = New-LocalTemporaryUser -Email $expectedEmails[0] -Role 'seller_a'
    $createdUserIds.Add($sellerA)

    $sellerB = New-LocalTemporaryUser -Email $expectedEmails[1] -Role 'seller_b'
    $createdUserIds.Add($sellerB)

    $buyer = New-LocalTemporaryUser -Email $expectedEmails[2] -Role 'buyer'
    $createdUserIds.Add($buyer)

    $parameterValues = @{
        seller_a_user_id = [string]$sellerA
        seller_b_user_id = [string]$sellerB
        buyer_id = [string]$buyer
        run_id = [string]$runId
    }
    foreach ($parameterName in $parameterValues.Keys) {
        if ([string]::IsNullOrWhiteSpace($parameterValues[$parameterName])) {
            throw "Parâmetro psql obrigatório vazio: $parameterName. run_id=$runId"
        }
    }

    $psqlArguments = @(
        '-X',
        '-U', 'postgres',
        '-d', 'postgres',
        '--set=ON_ERROR_STOP=1',
        "--set=seller_a_user_id=$sellerA",
        "--set=seller_b_user_id=$sellerB",
        "--set=buyer_id=$buyer",
        "--set=run_id=$runId"
    )

    $testOutput = $testSql | docker exec -i $container psql @psqlArguments 2>&1
    $testExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        throw "Docker/psql falhou ao executar o teste (exit code $testExitCode). run_id=$runId"
    }
}
catch {
    $errors.Add($_.Exception.Message)
}
finally {
    try {
        # Reconcilia respostas perdidas usando email exato e metadata exata do run.
        $reconciledUsers = @(Get-RunUsers)
        foreach ($user in $reconciledUsers) {
            $userId = [guid]$user.id
            if (-not $createdUserIds.Contains($userId)) {
                $createdUserIds.Add($userId)
            }
        }
    }
    catch {
        $errors.Add("Reconciliação de usuários falhou para run_id=$runId.")
    }

    foreach ($userId in @($createdUserIds | Select-Object -Unique)) {
        try {
            Remove-LocalTemporaryUser -UserId $userId
        }
        catch {
            $errors.Add("Falha ao remover usuário temporário $userId para run_id=$runId.")
        }
    }

    try {
        $remainingUsers = @(Get-RunUsers)
        if ($remainingUsers.Count -gt 0) {
            $remainingIds = ($remainingUsers | ForEach-Object { $_.id }) -join ', '
            $errors.Add("Usuários temporários permaneceram após a limpeza para run_id=${runId}: $remainingIds")
        }
    }
    catch {
        $errors.Add("Não foi possível confirmar a limpeza via Auth Admin API para run_id=$runId.")
    }

    $verificationSql = @"
select
  (select count(*) from auth.users
    where coalesce(raw_user_meta_data ->> 'gemn_test_run', '') = '$runId') as auth_users_remaining,
  (select count(*) from public.seller_applications
    where nome_negocio like 'S31D_$runId%') as applications_remaining,
  (select count(*) from public.sellers
    where nome_negocio like 'S31D_$runId%') as sellers_remaining;
"@

    try {
        $verificationArguments = @(
            '-X',
            '-U', 'postgres',
            '-d', 'postgres',
            '--set=ON_ERROR_STOP=1',
            '-At',
            '-c', $verificationSql
        )

        $previousErrorActionPreference = $ErrorActionPreference
        try {
            # stderr de processo nativo não deve interromper a captura do exit code.
            $ErrorActionPreference = 'Continue'
            $verificationOutput = & docker exec $container psql @verificationArguments 2>&1
            $verificationExitCode = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($verificationExitCode -ne 0) {
            $errors.Add("Docker/psql falhou na verificação de resíduos (exit code $verificationExitCode). run_id=$runId")
        }
        else {
            $verificationResult = ($verificationOutput -join [Environment]::NewLine).Trim()
            if ($verificationResult -notmatch '^0\|0\|0$') {
                $errors.Add("A verificação de resíduos retornou '$verificationResult' em vez de 0|0|0. run_id=$runId")
            }
        }
    }
    catch {
        $exceptionType = $_.Exception.GetType().Name
        $errors.Add("A verificação de resíduos lançou $exceptionType para run_id=$runId.")
    }
}

if ($testOutput.Count -gt 0) {
    Write-Output (ConvertTo-SafeText $testOutput)
}

if ($verificationOutput.Count -gt 0) {
    Write-Output "Verificação de resíduos para run_id=${runId}:"
    Write-Output (ConvertTo-SafeText $verificationOutput)
}

if ($errors.Count -gt 0) {
    throw (($errors -join [Environment]::NewLine) + " Run_id para recuperação manual segura: $runId")
}

Write-Output "Teste de perfil concluído e limpeza confirmada. run_id=$runId"
