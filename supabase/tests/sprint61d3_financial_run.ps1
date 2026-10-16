[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $Container,
  [string] $DbHost = '127.0.0.1',
  [int] $DbPort = 54322,
  [string] $DbName = 'postgres',
  [string] $DbUser = 'postgres',
  [string] $RunId = ('d3r1_' + [guid]::NewGuid().ToString('N').Substring(0, 8)),
  [string] $BuyerAEmail = '',
  [string] $BuyerBEmail = ''
)

$ErrorActionPreference = 'Stop'
$fixture = Join-Path $PSScriptRoot 'sprint22_fixtures.sql'
$test = Join-Path $PSScriptRoot 'sprint61d3_financial.sql'

if ([string]::IsNullOrWhiteSpace($BuyerAEmail)) { $BuyerAEmail = "$RunId.buyer.a@example.local" }
if ([string]::IsNullOrWhiteSpace($BuyerBEmail)) { $BuyerBEmail = "$RunId.buyer.b@example.local" }

$inspect = docker inspect $Container | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $null -eq $inspect) {
  throw "Container '$Container' nao foi encontrado."
}
$projectLabel = $inspect[0].Config.Labels.'com.supabase.cli.project'
if ([string]::IsNullOrWhiteSpace($projectLabel) -or $projectLabel -eq 'gemn') {
  throw "Recusando executar testes no projeto original ou em container sem project label exclusivo."
}
$tcp = Test-NetConnection -ComputerName $DbHost -Port $DbPort -WarningAction SilentlyContinue
if (-not $tcp.TcpTestSucceeded) {
  throw "Banco local indisponivel em ${DbHost}:${DbPort}."
}

function Invoke-LocalSql([string] $Sql) {
  $Sql | docker exec -i $Container psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName
  if ($LASTEXITCODE -ne 0) { throw "psql falhou no container '$Container'." }
}

$buyerSql = @"
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,is_sso_user,is_anonymous)
values
 ('00000000-0000-0000-0000-000000000000'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'authenticated','authenticated','$BuyerAEmail', crypt('LocalOnlyA!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, false),
 ('00000000-0000-0000-0000-000000000000'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, 'authenticated','authenticated','$BuyerBEmail', crypt('LocalOnlyB!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false, false);
"@
Invoke-LocalSql $buyerSql

Get-Content -LiteralPath $fixture | docker exec -i $Container psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -v run_id=$RunId -v buyer_a_email=$BuyerAEmail -v buyer_b_email=$BuyerBEmail
if ($LASTEXITCODE -ne 0) { throw 'Fixtures sprint22 falharam.' }

Get-Content -LiteralPath $test | docker exec -i $Container psql -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -v run_id=$RunId -v buyer_a_email=$BuyerAEmail -v buyer_b_email=$BuyerBEmail
if ($LASTEXITCODE -ne 0) { throw 'Testes financeiros D3-R1 falharam.' }

Write-Output "SPRINT61D3R1_RUN_OK project=$projectLabel container=$Container host=$DbHost port=$DbPort run_id=$RunId"
