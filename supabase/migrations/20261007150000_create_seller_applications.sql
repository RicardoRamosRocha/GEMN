-- GEMN: solicitações de aprovação para atuação como vendedor.
--
-- Todo usuário começa como Cliente. A aprovação de uma solicitação e a
-- criação de sellers serão implementadas em uma migration posterior, junto
-- com a auditoria administrativa.

create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tipo_membro text not null,
  nome_negocio text not null,
  cpf text,
  cnpj text,
  responsavel text,
  telefone text not null,
  categoria text not null,
  descricao text not null,
  status text not null default 'pendente',
  observacao_admin text,
  criado_em timestamptz not null default now(),
  analisado_em timestamptz,
  analisado_por uuid references public.profiles (id)
);

comment on table public.seller_applications is
  'Solicitações de usuários para aprovação como vendedor; aprovação, sellers e auditoria serão implementados posteriormente.';
comment on column public.seller_applications.tipo_membro is
  'Tipo solicitado: empreendedor ou empresa.';
comment on column public.seller_applications.cpf is
  'Identificador sensível do empreendedor; não deve ser exposto publicamente.';
comment on column public.seller_applications.cnpj is
  'Identificador sensível da empresa; não deve ser exposto publicamente.';
comment on column public.seller_applications.status is
  'Situação da solicitação: pendente, aprovada ou recusada.';
comment on column public.seller_applications.observacao_admin is
  'Observação administrativa, preenchida somente por caminho privilegiado futuro.';
comment on column public.seller_applications.analisado_em is
  'Data e hora da análise administrativa, preenchida somente por caminho privilegiado futuro.';
comment on column public.seller_applications.analisado_por is
  'Administrador responsável pela análise, preenchido somente por caminho privilegiado futuro.';

-- CHECK em text mantém a migration simples e permite alterar os valores
-- posteriormente sem a complexidade de alterar tipos ENUM.
alter table public.seller_applications
  add constraint seller_applications_tipo_membro_check
    check (tipo_membro in ('empreendedor', 'empresa')),
  add constraint seller_applications_status_check
    check (status in ('pendente', 'aprovada', 'recusada')),
  add constraint seller_applications_documento_por_tipo_check
    check (
      (
        tipo_membro = 'empreendedor'
        and nullif(btrim(cpf), '') is not null
        and cnpj is null
      )
      or (
        tipo_membro = 'empresa'
        and nullif(btrim(cnpj), '') is not null
        and cpf is null
      )
    );

-- Solicitações aprovadas e recusadas permanecem no histórico. Somente uma
-- solicitação pendente pode existir para cada usuário.
create unique index seller_applications_one_pending_per_user_idx
  on public.seller_applications (user_id)
  where status = 'pendente';

alter table public.seller_applications enable row level security;

-- Um usuário autenticado só pode consultar as próprias solicitações.
create policy seller_applications_select_own
  on public.seller_applications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- O usuário só pode criar uma solicitação vinculada ao próprio usuário.
-- Os privilégios de coluna abaixo impedem o preenchimento direto dos campos
-- administrativos durante o INSERT; status usa o default controlado pelo banco.
create policy seller_applications_insert_own
  on public.seller_applications
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Não há policies de UPDATE ou DELETE para authenticated e nenhum privilégio
-- correspondente é concedido. O acesso administrativo será definido depois,
-- em caminho privilegiado seguro, junto com sellers e auditoria.

revoke all on table public.seller_applications from anon, authenticated;

grant select (
  id,
  user_id,
  tipo_membro,
  nome_negocio,
  cpf,
  cnpj,
  responsavel,
  telefone,
  categoria,
  descricao,
  status,
  observacao_admin,
  criado_em,
  analisado_em,
  analisado_por
)
on table public.seller_applications
to authenticated;

grant insert (
  user_id,
  tipo_membro,
  nome_negocio,
  cpf,
  cnpj,
  responsavel,
  telefone,
  categoria,
  descricao
)
on table public.seller_applications
to authenticated;
