-- GEMN: vendedores aprovados e fluxo administrativo de análise.
--
-- Um seller só é criado pelo fluxo administrativo abaixo. Usuários comuns
-- podem consultar os dados necessários ao marketplace, mas não podem criar,
-- alterar ou remover sellers diretamente.

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null references public.seller_applications (id),
  tipo_membro text not null,
  nome_negocio text not null,
  descricao text not null,
  telefone text not null,
  status text not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint sellers_tipo_membro_check
    check (tipo_membro in ('empreendedor', 'empresa')),
  constraint sellers_status_check
    check (status in ('ativo', 'suspenso')),
  constraint sellers_one_per_user_unique
    unique (user_id),
  constraint sellers_one_per_application_unique
    unique (application_id)
);

comment on table public.sellers is
  'Vendedores aprovados; a capacidade de vender depende da existência de seller ativo.';
comment on column public.sellers.user_id is
  'Usuário autenticado ao qual o seller pertence; um usuário só pode ter um seller.';
comment on column public.sellers.application_id is
  'Solicitação aprovada que originou o seller; uma solicitação só pode originar um seller.';
comment on column public.sellers.status is
  'Situação operacional do seller: ativo ou suspenso.';

-- Mantém atualizado_em sob controle do banco, no mesmo padrão de profiles.
create or replace function public.set_seller_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger set_sellers_updated_at
  before update on public.sellers
  for each row
  execute function public.set_seller_updated_at();

alter table public.sellers enable row level security;

-- Os campos de sellers não contêm CPF/CNPJ. Usuários autenticados podem
-- consultar os sellers necessários ao marketplace.
create policy sellers_select_marketplace
  on public.sellers
  for select
  to authenticated
  using (true);

-- Administradores podem consultar solicitações para conduzir o fluxo. Essa
-- leitura inclui os dados sensíveis já existentes na tabela de solicitações,
-- mas não os replica para sellers.
create policy seller_applications_select_admin
  on public.seller_applications
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.profiles as p
       where p.id = (select auth.uid())
         and p.is_admin = true
    )
  );

-- Não há policies de INSERT, UPDATE ou DELETE para authenticated.
revoke all on table public.sellers from anon, authenticated;

grant select (
  id,
  user_id,
  application_id,
  tipo_membro,
  nome_negocio,
  descricao,
  telefone,
  status,
  criado_em,
  atualizado_em
)
on table public.sellers
to authenticated;

-- O trigger é um detalhe interno do banco e não fica disponível para
-- chamadas diretas de clientes.
revoke all on function public.set_seller_updated_at() from public;

-- Analisa uma solicitação pendente usando exclusivamente auth.uid() para
-- identificar o administrador. Em caso de aprovação, a atualização da
-- solicitação e a criação do seller ocorrem na mesma transação da chamada.
create or replace function public.review_seller_application(
  p_application_id uuid,
  p_decisao text,
  p_observacao_admin text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_application public.seller_applications%rowtype;
  v_seller_id uuid;
begin
  if v_admin_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado é obrigatório';
  end if;

  if p_decisao not in ('aprovar', 'recusar') then
    raise exception using
      errcode = 'P0001',
      message = 'decisão inválida; use aprovar ou recusar';
  end if;

  select p.is_admin
    into v_is_admin
    from public.profiles as p
   where p.id = v_admin_id;

  if not coalesce(v_is_admin, false) then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado não é administrador';
  end if;

  -- Serializa análises simultâneas da mesma solicitação. A segunda chamada
  -- aguardará o lock e depois encontrará status diferente de pendente.
  select sa.*
    into v_application
    from public.seller_applications as sa
   where sa.id = p_application_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'seller_application não encontrada';
  end if;

  if v_application.status <> 'pendente' then
    raise exception using
      errcode = 'P0001',
      message = 'seller_application já foi analisada';
  end if;

  if p_decisao = 'recusar' then
    update public.seller_applications as sa
       set status = 'recusada',
           observacao_admin = p_observacao_admin,
           analisado_em = now(),
           analisado_por = v_admin_id
     where sa.id = v_application.id;

    return null;
  end if;

  update public.seller_applications as sa
     set status = 'aprovada',
         observacao_admin = p_observacao_admin,
         analisado_em = now(),
         analisado_por = v_admin_id
   where sa.id = v_application.id;

  insert into public.sellers (
    user_id,
    application_id,
    tipo_membro,
    nome_negocio,
    descricao,
    telefone
  )
  values (
    v_application.user_id,
    v_application.id,
    v_application.tipo_membro,
    v_application.nome_negocio,
    v_application.descricao,
    v_application.telefone
  )
  returning id into v_seller_id;

  return v_seller_id;
end;
$$;

-- A função é o único caminho de análise exposto ao cliente autenticado.
-- O papel authenticated não recebe UPDATE direto em seller_applications.
revoke all on function public.review_seller_application(uuid, text, text) from public;
grant execute on function public.review_seller_application(uuid, text, text)
  to authenticated;
