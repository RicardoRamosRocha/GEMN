[CmdletBinding()]
param(
    [ValidateSet('Create', 'Remove')]
    [string]$Mode = 'Create',
    [string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$apiBase = 'http://127.0.0.1:54321'
$dbContainer = 'supabase_db_gemn'
$serviceRoleEnvironmentVariable = 'GEMN_LOCAL_SUPABASE_SERVICE_ROLE_KEY'
$adminMarker = 'gemn_local_temporary_admin'

function Get-RunId {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return [guid]::NewGuid().ToString('N')
    }

    if ($Value -notmatch '^[0-9a-f]{32}$') {
        throw 'Run ID inválido. Use somente 32 caracteres hexadecimais.'
    }

    return $Value.ToLowerInvariant()
}

function Get-AdminEmail {
    param([string]$Value)

    return "gemn-local-admin-$Value@local.invalid"
}

function Assert-UserId {
    param([string]$UserId)

    if ([string]::IsNullOrWhiteSpace($UserId) -or $UserId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
        throw 'A Auth Admin API local retornou um UUID de usuário inválido.'
    }
}

function Get-LocalServiceRoleKey {
    $key = [Environment]::GetEnvironmentVariable($serviceRoleEnvironmentVariable, 'Process')
    if ([string]::IsNullOrWhiteSpace($key)) {
        throw "Defina $serviceRoleEnvironmentVariable somente com a chave administrativa do Supabase local."
    }

    return $key
}

function Get-LocalAuthHeaders {
    param([string]$Key)

    return @{
        apikey = $Key
        Authorization = "Bearer $Key"
        'Content-Type' = 'application/json'
    }
}

function ConvertTo-PlainText {
    param([System.Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Read-TemporaryPassword {
    $securePassword = Read-Host 'Senha temporária forte (não será exibida)' -AsSecureString
    $password = ConvertTo-PlainText $securePassword
    if ([string]::IsNullOrWhiteSpace($password) -or $password.Length -lt 16) {
        throw 'A senha temporária deve possuir pelo menos 16 caracteres.'
    }

    return $password
}

function Get-ExactLocalUser {
    param(
        [hashtable]$Headers,
        [string]$Email,
        [string]$ExpectedRunId
    )

    $uri = "$apiBase/auth/v1/admin/users?per_page=1000&page=1"
    $result = Invoke-RestMethod -Uri $uri -Method Get -Headers $Headers
    $users = @($result.users)
    $matches = @($users | Where-Object {
        $_.email -eq $Email -and
        $_.user_metadata.gemn_local_admin_run_id -eq $ExpectedRunId -and
        $_.user_metadata.gemn_local_admin_marker -eq $adminMarker
    })

    if ($matches.Count -gt 1) {
        throw "Mais de uma identidade corresponde ao run_id $ExpectedRunId. Limpeza interrompida."
    }

    if ($matches.Count -eq 0) {
        return $null
    }

    Assert-UserId -UserId ([string]$matches[0].id)
    return $matches[0]
}

function Invoke-LocalSql {
    param(
        [string]$Sql,
        [hashtable]$Variables = @{}
    )

    $arguments = @(
        'exec',
        '-i',
        $dbContainer,
        'psql',
        '-U', 'postgres',
        '-d', 'postgres',
        '-X',
        '-A',
        '-t',
        '-v', 'ON_ERROR_STOP=1'
    )

    foreach ($entry in $Variables.GetEnumerator()) {
        $arguments += "--set=$($entry.Key)=$($entry.Value)"
    }

    $output = $Sql | & docker @arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Consulta PostgreSQL local falhou (exit code $exitCode)."
    }

    return (($output | Out-String).Trim())
}

function Assert-ExactProfile {
    param(
        [string]$UserId,
        [string]$Email,
        [string]$ExpectedRunId
    )

    $variables = @{
        user_id = $UserId
        email = $Email
        run_id = $ExpectedRunId
    }

    $profileCount = Invoke-LocalSql -Variables $variables -Sql @"
select count(*)
  from public.profiles as p
 where p.id = :'user_id'::uuid
   and exists (
       select 1
         from auth.users as u
        where u.id = p.id
          and u.email = :'email'
          and u.raw_user_meta_data ->> 'gemn_local_admin_run_id' = :'run_id'
          and u.raw_user_meta_data ->> 'gemn_local_admin_marker' = '$adminMarker'
   );
"@

    if ($profileCount -ne '1') {
        throw 'O usuário local criado não possui exatamente um perfil correspondente.'
    }

    $changed = Invoke-LocalSql -Variables $variables -Sql @"
with changed as (
    update public.profiles as p
       set is_admin = true
     where p.id = :'user_id'::uuid
       and p.is_admin = false
       and exists (
           select 1
             from auth.users as u
            where u.id = p.id
              and u.email = :'email'
              and u.raw_user_meta_data ->> 'gemn_local_admin_run_id' = :'run_id'
              and u.raw_user_meta_data ->> 'gemn_local_admin_marker' = '$adminMarker'
       )
     returning p.id
)
select count(*) from changed;
"@

    if ($changed -ne '1') {
        throw 'O perfil local não foi promovido de forma exclusiva e verificável.'
    }

    $adminCheck = Invoke-LocalSql -Variables $variables -Sql @"
select count(*)
  from public.profiles as p
 where p.id = :'user_id'::uuid
   and p.is_admin = true
   and exists (
       select 1
         from auth.users as u
        where u.id = p.id
          and u.email = :'email'
          and u.raw_user_meta_data ->> 'gemn_local_admin_run_id' = :'run_id'
          and u.raw_user_meta_data ->> 'gemn_local_admin_marker' = '$adminMarker'
   );
"@

    if ($adminCheck -ne '1') {
        throw 'A verificação final do administrador local falhou.'
    }
}

function Remove-ExactLocalUser {
    param(
        [hashtable]$Headers,
        [string]$Email,
        [string]$ExpectedRunId
    )

    $user = Get-ExactLocalUser -Headers $Headers -Email $Email -ExpectedRunId $ExpectedRunId
    if ($null -eq $user) {
        throw "Nenhuma identidade temporária exata foi encontrada para o run_id $ExpectedRunId."
    }

    $userId = [string]$user.id
    Assert-UserId -UserId $userId
    $variables = @{
        user_id = $userId
        email = $Email
        run_id = $ExpectedRunId
    }
    $ownership = Invoke-LocalSql -Variables $variables -Sql @"
select count(*)
  from auth.users as u
 where u.id = :'user_id'::uuid
   and u.email = :'email'
   and u.raw_user_meta_data ->> 'gemn_local_admin_run_id' = :'run_id'
   and u.raw_user_meta_data ->> 'gemn_local_admin_marker' = '$adminMarker'
   and not exists (select 1 from public.seller_applications as sa where sa.user_id = u.id)
   and not exists (select 1 from public.sellers as s where s.user_id = u.id);
"@

    if ($ownership -ne '1') {
        throw "A identidade não corresponde exatamente ao administrador temporário ou possui vínculos de vendedor. run_id=$ExpectedRunId"
    }

    Invoke-RestMethod -Uri "$apiBase/auth/v1/admin/users/$userId" -Method Delete -Headers $Headers | Out-Null
    $remaining = Get-ExactLocalUser -Headers $Headers -Email $Email -ExpectedRunId $ExpectedRunId
    if ($null -ne $remaining) {
        throw "A remoção não foi confirmada para o run_id $ExpectedRunId."
    }
}

$runId = Get-RunId $RunId
$email = Get-AdminEmail $runId
$serviceRoleKey = Get-LocalServiceRoleKey
$headers = Get-LocalAuthHeaders $serviceRoleKey

if ($Mode -eq 'Remove') {
    Remove-ExactLocalUser -Headers $headers -Email $email -ExpectedRunId $runId
    Write-Output "Administrador temporário removido. run_id=$runId"
    exit 0
}

$existing = Get-ExactLocalUser -Headers $headers -Email $email -ExpectedRunId $runId
if ($null -ne $existing) {
    throw "Já existe uma identidade temporária para o run_id $runId. Use outro run_id ou o modo Remove."
}

$createdUserId = $null
$primaryFailure = $null
$cleanupFailure = $null

try {
    $password = Read-TemporaryPassword
    $payload = @{
        email = $email
        password = $password
        email_confirm = $true
        user_metadata = @{
            gemn_local_admin_run_id = $runId
            gemn_local_admin_marker = $adminMarker
        }
    } | ConvertTo-Json -Depth 5

    try {
        $created = Invoke-RestMethod -Uri "$apiBase/auth/v1/admin/users" -Method Post -Headers $headers -Body $payload
    }
    finally {
        $password = $null
    }
    $createdUserId = [string]$created.id
    Assert-UserId -UserId $createdUserId

    $exactCreated = Get-ExactLocalUser -Headers $headers -Email $email -ExpectedRunId $runId
    if ($null -eq $exactCreated -or [string]$exactCreated.id -ne $createdUserId) {
        throw 'A identidade retornada pela Auth Admin API não passou na reconciliação exata.'
    }

    Assert-ExactProfile -UserId $createdUserId -Email $email -ExpectedRunId $runId
    Write-Output "Administrador temporário local criado. run_id=$runId email=$email"
    Write-Output 'A senha não foi registrada. Utilize a senha informada no prompt para o login local.'
}
catch {
    $primaryFailure = $_.Exception
}
finally {
    if ($null -ne $primaryFailure -and -not [string]::IsNullOrWhiteSpace($createdUserId)) {
        try {
            Remove-ExactLocalUser -Headers $headers -Email $email -ExpectedRunId $runId
        }
        catch {
            $cleanupFailure = $_.Exception
        }
    }
}

if ($null -ne $primaryFailure) {
    if ($null -ne $cleanupFailure) {
        throw "Falha na criação do administrador temporário e na limpeza. run_id=$runId. Remoção manual segura necessária."
    }

    throw $primaryFailure
}
