[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $Container,
  [Parameter(Mandatory = $true)] [string] $ListingA,
  [Parameter(Mandatory = $true)] [string] $ListingB,
  [Parameter(Mandatory = $true)] [string] $IdempotencyKey,
  [string] $BuyerId = '10000000-0000-0000-0000-000000000002',
  [string] $DbHost = '127.0.0.1',
  [int] $DbPort = 55522,
  [string] $DbName = 'postgres',
  [string] $DbUser = 'postgres'
)

$ErrorActionPreference = 'Stop'

$inspect = docker inspect $Container | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $null -eq $inspect) {
  throw "Container '$Container' nao foi encontrado."
}
$projectLabel = $inspect[0].Config.Labels.'com.supabase.cli.project'
if ([string]::IsNullOrWhiteSpace($projectLabel) -or $projectLabel -eq 'gemn') {
  throw 'Recusando executar fora de um projeto Supabase local com label exclusivo.'
}
$tcp = Test-NetConnection -ComputerName $DbHost -Port $DbPort -WarningAction SilentlyContinue
if (-not $tcp.TcpTestSucceeded) {
  throw "Banco local indisponivel em ${DbHost}:${DbPort}."
}

function New-IntentSql([string] $listingId) {
  return @"
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','$BuyerId',true);
select * from public.create_order_from_items(
  jsonb_build_array(jsonb_build_object('listing_id','$listingId'::uuid,'quantidade',1)),
  0,
  '$IdempotencyKey'::uuid
);
commit;
reset role;
"@
}

$worker = {
  param($WorkerContainer, $WorkerDbUser, $WorkerDbName, $WorkerSql)
  $workerOutput = @($WorkerSql | docker exec -i $WorkerContainer psql -v ON_ERROR_STOP=1 -U $WorkerDbUser -d $WorkerDbName 2>&1)
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $workerOutput }
}

$jobA = Start-Job -ScriptBlock $worker -ArgumentList $Container, $DbUser, $DbName, (New-IntentSql $ListingA)
$jobB = Start-Job -ScriptBlock $worker -ArgumentList $Container, $DbUser, $DbName, (New-IntentSql $ListingB)
Wait-Job $jobA, $jobB | Out-Null
$resultA = Receive-Job $jobA -ErrorAction SilentlyContinue
$resultB = Receive-Job $jobB -ErrorAction SilentlyContinue
Remove-Job $jobA, $jobB -Force

$output = (@($resultA, $resultB) | ForEach-Object { $_.Output }) -join "`n"
$divergentRejected = $output -match 'idempotency_key ja foi usada com outra intencao de compra'
if (-not $divergentRejected) {
  throw "A segunda intencao nao foi rejeitada como divergente. Saida:`n$output"
}

$summarySql = @"
select count(*)::text || '|' || count(distinct o.id)::text || '|' || count(*)::text
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
 where o.buyer_id = '$BuyerId'::uuid
   and o.idempotency_key = '$IdempotencyKey'::uuid;
"@
$summary = ($summarySql | docker exec -i $Container psql -At -v ON_ERROR_STOP=1 -U $DbUser -d $DbName).Trim()
if ($LASTEXITCODE -ne 0 -or $summary -ne '1|1|1') {
  throw "Resultado final inesperado: '$summary'."
}

Write-Output "SPRINT61D4_CONCURRENT_DIVERGENT_OK project=$projectLabel container=$Container host=$DbHost port=$DbPort"
