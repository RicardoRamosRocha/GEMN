# Sprint 6.1-B — Asaas Sandbox health check

## Contrato

`GET /functions/v1/asaas-health-check`

A função exige um JWT Supabase válido e uma linha correspondente em
`public.profiles` com `is_admin = true`. Como o projeto utiliza tokens
assimétricos ES256, a função mantém `verify_jwt = false` e faz a validação do
JWT dentro do próprio código antes de consultar a autorização administrativa.

Em caso de sucesso, o retorno não inclui resposta da API Asaas, conta, saldo,
token ou qualquer dado financeiro:

```json
{
  "ok": true,
  "service": "asaas",
  "environment": "sandbox",
  "status": "reachable",
  "checkedAt": "2026-10-17T00:00:00.000Z"
}
```

## Teste local

Pré-requisitos:

1. Supabase CLI instalado e autenticado para o ambiente local.
2. Um usuário local administrador, com `public.profiles.is_admin = true`.
3. Um arquivo de ambiente local não versionado contendo os valores necessários:
   `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`,
   `ASAAS_ACCESS_TOKEN`, `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

Inicie a função sem desabilitar a verificação JWT:

```powershell
supabase functions serve asaas-health-check --env-file .\supabase\.env.functions.local
```

Obtenha um access token do usuário administrador pelo fluxo normal do Supabase
Auth e chame a função:

```powershell
$headers = @{ Authorization = "Bearer <ADMIN_ACCESS_TOKEN>" }
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:54321/functions/v1/asaas-health-check" `
  -Headers $headers
```

Resultados esperados:

- `200`: comunicação Sandbox validada.
- `401`: JWT ausente, inválido ou expirado.
- `403`: usuário autenticado, mas não administrador.
- `500`: configuração ausente/inválida ou tentativa de usar outro ambiente.
- `502`: timeout, indisponibilidade ou resposta não-2xx do Asaas.

O uso de `--no-verify-jwt` no servidor local não substitui a validação interna;
ela continua obrigatória e é exercida pelo código da função.

## Teste pelo aplicativo

Com uma sessão administrativa ativa:

```ts
const { data, error } = await supabase.functions.invoke('asaas-health-check', {
  method: 'GET',
});
```

O cliente deve tratar `401` e `403` como falha de autorização, sem tentar
reenviar credenciais Asaas.

## Publicação no Supabase DEV

A publicação deve ser executada somente após revisão e validação local:

```powershell
supabase functions deploy asaas-health-check --project-ref <DEV_PROJECT_REF>
```

Os secrets `ASAAS_ACCESS_TOKEN` e `ASAAS_BASE_URL` já devem existir no projeto
DEV. Não coloque valores de secrets em arquivos versionados nem passe a API key
na linha de comando.

Após a publicação, repita a chamada usando o endpoint DEV:

```text
https://<DEV_PROJECT_REF>.supabase.co/functions/v1/asaas-health-check
```

## Resultado real no Supabase DEV

Teste executado pelo aplicativo Web com uma sessÃ£o administrativa legÃ­tima
no projeto DEV `lfsbjynpsgcvdtaeotho`.

Resultado sanitizado:

```text
HTTP 200
ok: true
service: asaas
environment: sandbox
status: reachable
```

A comunicaÃ§Ã£o com o Asaas Sandbox foi confirmada. Nenhum token, segredo,
credencial ou dado financeiro foi incluÃ­do no resultado ou nos logs.

O deploy não faz parte desta etapa.
