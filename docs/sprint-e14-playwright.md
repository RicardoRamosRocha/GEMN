# Sprint E14 — testes E2E com Playwright

## Escopo inicial

O primeiro teste automatizado valida somente a abertura do Expo Web e a renderização da tela de login. O servidor E2E usa valores sintéticos de Supabase definidos no processo pelo launcher `scripts/start-e2e-web.mjs`; nenhum `.env` é lido ou alterado e nenhuma instância Supabase é necessária para este cenário.

Playwright é compatível com Expo Web porque o Expo SDK 57 publica a aplicação como uma página web executável em um navegador Chromium. A automação cobre o resultado renderizado pelo React Native Web; ela não substitui testes nativos Android/iOS.

## Windows

```powershell
npm install
npm run test:e2e
```

No Windows, o runner usa o Chrome instalado na máquina (`channel: chrome`), sem baixar um Chromium adicional. No Linux, o Playwright usa o Chromium gerenciado por ele. Se o Chrome não estiver instalado no Windows, remova essa opção/configure um browser disponível e execute `npx playwright install chromium`. O relatório HTML fica em `playwright-report/`; em caso de falha, a captura de tela fica em `test-results/`. O comando não inicia Supabase, não acessa DEV/PROD e não usa Asaas.

## Linux

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

O launcher invoca o Expo CLI local pelo Node, mantendo o mesmo comando npm nos dois sistemas.

## Segurança dos artefatos

O runner captura tela somente quando um teste falha e mantém trace/vídeo desativados. O cenário atual não preenche credenciais. Ao adicionar testes de autenticação, usar sempre usuários sintéticos locais, evitar `expect`/logs com tokens ou senhas e manter as mesmas opções de artefatos.

## Próximos cenários

1. Login com usuário sintético criado no Supabase local E13.
2. Solicitação de recuperação de senha com Mailpit local.
3. Abertura do link recebido no Mailpit e definição de nova senha.
4. Verificação de sessão encerrada e isolamento entre testes.

## E13 no Windows

O E13 versionado atualmente contém scripts Bash e não está inicializado nesta máquina (`infra/e13-linux/supabase/.temp` ausente; a CLI Supabase/Docker não está disponível como comando). A solução segura é provisionar uma instância local separada, com Docker Desktop e Supabase CLI, usando `infra/e13-linux/supabase/config.toml`, sincronizar as fontes canônicas e executar o preflight antes de iniciar. Não reutilizar recursos de outros ambientes, não apontar para `supabase/` raiz e não copiar chaves para `.env` versionado. O launcher desta etapa não depende do E13.
