# GEMN — Encerramento da sessão Linux — 26/10/2026

## Escopo

Sessão encerrada na branch `feat/redesign-ui-gemn`, com foco no isolamento do Expo Web no Supabase E13 local e na preparação do fluxo de recuperação de senha.

Não foram acessados Supabase DEV/PROD, pagamentos, Asaas ou dados financeiros. Não foram executadas migrations nem alterações diretas de senha.

## Implementações realizadas

- Adicionado o fluxo de recuperação de senha no GEMN:
  - link “Esqueci minha senha” na tela de login;
  - solicitação neutra por e-mail;
  - tela de nova senha;
  - uso de `resetPasswordForEmail` e `updateUser({ password })`;
  - tratamento Web e deep link nativo;
  - limpeza de parâmetros da URL após processamento.
- Configurado o esquema nativo `gemn`.
- Adicionado redirect nativo no E13.
- Criado launcher `npm run web:e13`:
  - obtém a chave pública via `supabase status -o env` sem exibi-la;
  - fixa a API em `http://127.0.0.1:64321`;
  - usa `EXPO_NO_DOTENV=1`;
  - inicia o Expo Web com cache limpo em uma raiz temporária sem arquivos `.env*`.
- Adicionado parser e teste de callbacks de recuperação para fragmento, `code` e URL normal.
- O cliente Web usa explicitamente `flowType: 'implicit'`, compatível com o formato esperado do callback E13.

## Arquivos incluídos

Código e configuração:

- `App.tsx`
- `app.json`
- `infra/e13-linux/supabase/config.toml`
- `package.json`
- `src/context/AuthContext.tsx`
- `src/context/authRecovery.ts`
- `src/lib/supabase.ts`
- `src/screens/LoginScreen.tsx`
- `src/screens/ForgotPasswordScreen.tsx`
- `src/screens/ResetPasswordScreen.tsx`

Scripts e testes:

- `scripts/start-e13-web.sh`
- `scripts/test-auth-recovery.mjs`

Documentação:

- `docs/relatorios/2026-10-26-encerramento-linux.md`

## Auditoria do worktree

No início da sessão, a branch confirmada foi `feat/redesign-ui-gemn`, alinhada ao remoto
`origin/feat/redesign-ui-gemn` (`0` commits à frente e `0` atrás). Foram encontrados 7
arquivos rastreados modificados e 6 arquivos novos no escopo desta entrega. Não foram
encontradas alterações não relacionadas, logs, tokens, senhas ou fixtures com credenciais
entre os arquivos candidatos ao commit.

Os artefatos locais ignorados — `.env*`, `.expo/`, `backups/`, `dist/`, fixtures locais e
diretórios temporários do Supabase — permaneceram somente no Linux e não serão adicionados.
Não foram excluídos para evitar remoção destrutiva de estado local.

## Validações

Executados com sucesso:

```text
npm run test:auth-recovery
git diff --check
```

O teste cobre a identificação de callbacks implícitos no fragmento, callbacks com `code` na query string e URLs normais. Não houve diagnóstico nos arquivos do fluxo de recuperação durante as verificações TypeScript direcionadas.

O `npm run typecheck` completo falhou com diagnósticos preexistentes concentrados nas Edge Functions Deno: tipos globais `Deno` ausentes, imports `npm:`/`jsr:` não resolvidos e imports com extensão `.ts` não habilitados no TypeScript principal. Após a correção dos diagnósticos encontrados nos arquivos do fluxo Web, não restaram diagnósticos direcionados nesses arquivos; os erros restantes pertencem ao código Deno em `infra/e13-linux/supabase/functions`.

## Evidências do E13

Foi observado no ambiente E13:

- `POST /recover` com HTTP 200;
- `GET /verify` com HTTP 303;
- evento `login` no Auth local;
- referer `http://localhost:19000`.

Essas evidências confirmam o recebimento e a verificação do pedido de recuperação no GoTrue. Elas não comprovam que o redirecionamento final entregou ao navegador o fragmento ou `code` necessários para o cliente Web.

## Pendência funcional

A recuperação de senha não foi validada funcionalmente de ponta a ponta. A tela “Nova senha” ainda não foi comprovada no navegador, e não foi realizada alteração de senha do comprador sintético.

O problema pendente é o callback Web após o HTTP 303. É necessário observar no navegador, sem registrar valores sensíveis, o host, caminho e nomes dos parâmetros do `Location` final e os eventos `INITIAL_SESSION`, `SIGNED_IN` e `PASSWORD_RECOVERY`.

## Estado do Git

Branch de trabalho:

```text
feat/redesign-ui-gemn
```

O estado inicial estava alinhado com `origin/feat/redesign-ui-gemn`. A área de trabalho contém apenas os arquivos listados neste relatório, além dos artefatos ignorados locais descritos acima.

## Retomada no Windows

1. Confirmar Docker Desktop ativo.
2. Confirmar que o projeto E13 local é `gemn-e13-linux`.
3. Verificar a API local em `http://127.0.0.1:64321` e o Mailpit.
4. Executar:

   ```powershell
   npm run web:e13
   ```

5. Abrir somente `http://127.0.0.1:19000`.
6. Solicitar uma nova recuperação pelo GEMN e abrir o novo e-mail no Mailpit.
7. Usar o DevTools com Preserve log para confirmar o redirect final e os eventos Auth sem copiar tokens ou links completos.

Não alternar entre `localhost:19000` e `127.0.0.1:19000` durante o mesmo teste, pois o armazenamento Web é separado por origem.

## Proposta de E2E com Playwright

Criar uma suíte local que:

1. inicia o GEMN Web com variáveis E13;
2. acessa a tela de login;
3. solicita recuperação para o comprador sintético autorizado;
4. consulta o Mailpit local e extrai o link somente dentro do teste, sem imprimir seu valor;
5. navega para o link;
6. verifica a tela “Nova senha”;
7. confirma que chamadas Supabase usam exclusivamente `127.0.0.1:64321`;
8. define uma senha de teste controlada;
9. valida logout e login novamente;
10. limpa estado do navegador ao final.

O teste deve usar somente E13, bloquear hosts `supabase.co` e serviços financeiros, e mascarar URLs, tokens, cookies e senhas em qualquer falha.

Esse E2E ainda não foi implementado nem executado nesta sessão.

