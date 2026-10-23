# GEMN E13 Linux — preparação isolada

Este diretório contém configuração versionável e verificações de pré-voo. Ele não cria nem inicia infraestrutura.

## Isolamento

- Projeto Supabase: `gemn-e13-linux`.
- Rede planejada: `gemn-e13-linux-net`.
- Containers planejados: `gemn-e13-linux-postgres`, `gemn-e13-linux-kong`, `gemn-e13-linux-auth`, `gemn-e13-linux-rest`, `gemn-e13-linux-edge` e `gemn-e13-linux-finalizer`.
- Volumes planejados: `gemn-e13-linux-pgdata`, `gemn-e13-linux-storage` e `gemn-e13-linux-edge`.
- Nenhum recurso E6, E10 ou `supabase_*_gemn` deve ser reutilizado.

As portas planejadas são 64321, 64322, 64323, 64324, 64327, 68083 e 68001. A disponibilidade é apenas um snapshot; o preflight deve ser repetido imediatamente antes da E3-B.

## Configuração e secrets

`supabase/config.toml` é independente de `../../supabase/config.toml`. O `project_id` exclusivo identifica o projeto local separadamente. `secrets.example` lista somente nomes e placeholders. A cópia local deve ficar ignorada pelo Git.

Nunca coloque tokens Asaas ou chaves Supabase no frontend, em `config.toml` ou na linha de comando.

## Sincronização das fontes

As migrations e Edge Functions dentro deste projeto são um espelho gerado. A fonte canônica continua sendo `../../supabase/`. O espelho é ignorado pelo Git para evitar duplicação.

Antes de sincronizar, o script recusa qualquer arquivo inesperado ou divergente no destino. Ele só copia arquivos ausentes, não usa `rsync --delete` e não remove arquivos.

```bash
bash infra/e13-linux/sync-sources.sh
```

O script pode ser executado novamente; arquivos iguais são preservados sem alteração. Ele valida 66 migrations, 38 arquivos de funções, caminhos relativos e SHA-256.

As cópias de `supabase/migrations/` e `supabase/functions/` são ignoradas pelo Git. A configuração, esta documentação, o preflight, o sincronizador e o template de secrets continuam versionáveis.

## Preflight

```bash
bash infra/e13-linux/preflight.sh
```

O script apenas consulta branch, working tree, portas, versão da CLI quando instalada e nomes Docker quando o daemon estiver acessível. Ele não executa `docker compose`, `supabase start`, `supabase stop`, `db push`, `db reset` nem migrations.

## CLI e diretório de trabalho

A CLI `2.122.0` foi confirmada via `npx`. A E3-B4 deverá executar a CLI com `infra/e13-linux` como raiz do projeto, onde ela encontra `supabase/config.toml`. Migrations e funções são sincronizadas para esta árvore; não se deve apontar a CLI para o `supabase/` existente e compartilhar seu estado.

`project_id` e `supabase/config.toml` separam o projeto e suas portas. A CLI confirmou por `status` read-only que procura o banco com o nome gerado `supabase_db_gemn-e13-linux`. Os nomes dos demais serviços e volumes ainda não devem ser presumidos sem inicialização. `--network-id gemn-e13-linux-net` deve ser usado para fixar a rede planejada.

O `supabase start` da CLI inicia o stack local, aplica migrations e seed. Como `db.seed.enabled = false`, a inicialização E13 não deve executar seed automático; as 66 migrations ainda serão aplicadas pelo fluxo local da CLI na E3-B4.

## Migrations

Na E3-B:

1. validar as 66 migrations em ordem de timestamp;
2. executar somente em banco E13 recém-criado;
3. registrar o estado em `supabase_migrations.schema_migrations`;
4. verificar funções, grants, RLS e tabelas Pix;
5. preparar fixtures sintéticas somente após o banco passar na validação.

Nenhuma migration é executada por este diretório.

## Frontend e webhook

Os arquivos `.env` e `.env.local` permanecem intactos. O launcher da E3-B deverá passar variáveis de processo para o Expo:

- Web: endpoint local publicado pelo Kong E13.
- Emulador Android: endereço do host acessível pelo emulador, normalmente `10.0.2.2`.
- Dispositivo físico: IP LAN da máquina.

O Asaas não alcança `localhost` ou `10.0.2.2`. O webhook precisará de relay/túnel temporário autenticado. O finalizer deve continuar privado.

## Bloqueios atuais

- `supabase status` read-only confirmou que o banco E13 ainda não existe; nenhum container foi iniciado.
- O nome do banco gerado foi observado, mas os nomes completos de todos os containers e volumes só podem ser confirmados após a criação; não se deve reutilizar recursos por nome presumido.
- O finalizer Asaas não é criado pelo Supabase CLI e deverá ser provisionado separadamente, mantendo-o privado.
- As portas estavam livres no último snapshot e devem ser revalidadas imediatamente antes da E3-B4.
