-- GEMN: categorias e anúncios de produtos/serviços.
--
-- Categorias são desativadas, não apagadas. Listings pertencem a um seller
-- específico e só ficam visíveis no marketplace quando todas as entidades
-- necessárias para publicação estão ativas.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint categories_nome_not_blank_check
    check (btrim(nome) <> '')
);

comment on table public.categories is
  'Categorias do marketplace; permanecem no histórico mesmo quando desativadas.';
comment on column public.categories.ativo is
  'Indica se a categoria pode receber novos listings publicados.';

-- A comparação normaliza espaços nas extremidades e ignora maiúsculas e
-- minúsculas, sem alterar o valor armazenado em nome.
create unique index categories_nome_case_insensitive_unique
  on public.categories (lower(btrim(nome)));

-- Mantém atualizado_em sob controle do banco, no mesmo padrão das tabelas
-- existentes.
create or replace function public.set_category_updated_at()
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

create trigger set_categories_updated_at
  before update on public.categories
  for each row
  execute function public.set_category_updated_at();

create or replace function public.prevent_category_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'categorias não podem ser apagadas fisicamente';
  return old;
end;
$$;

create trigger prevent_categories_delete
  before delete on public.categories
  for each row
  execute function public.prevent_category_delete();

alter table public.categories enable row level security;

create policy categories_select_authenticated
  on public.categories
  for select
  to authenticated
  using (true);

-- Não há escrita direta para authenticated; categorias serão administradas
-- por fluxo seguro em uma etapa posterior.
revoke all on table public.categories from anon, authenticated;

grant select (
  id,
  nome,
  ativo,
  criado_em,
  atualizado_em
)
on table public.categories
to authenticated;

revoke all on function public.set_category_updated_at() from public;
revoke all on function public.prevent_category_delete() from public;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id),
  category_id uuid not null references public.categories (id),
  tipo text not null,
  nome text not null,
  descricao text not null,
  preco_real numeric(12, 2) not null,
  aceita_gemn boolean not null default false,
  preco_gemn numeric(12, 2),
  imagem_principal text,
  status text not null default 'rascunho',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint listings_tipo_check
    check (tipo in ('produto', 'servico')),
  constraint listings_nome_not_blank_check
    check (btrim(nome) <> ''),
  constraint listings_descricao_not_blank_check
    check (btrim(descricao) <> ''),
  constraint listings_preco_real_nonnegative_check
    check (preco_real >= 0),
  constraint listings_preco_gemn_consistency_check
    check (
      (aceita_gemn = false and preco_gemn is null)
      or (
        aceita_gemn = true
        and preco_gemn is not null
        and preco_gemn >= 0
      )
    ),
  constraint listings_status_check
    check (status in ('rascunho', 'ativo', 'inativo'))
);

comment on table public.listings is
  'Produtos e serviços publicados por sellers; listings inativos preservam histórico.';
comment on column public.listings.imagem_principal is
  'Caminho ou chave futura de objeto no Supabase Storage, não uma URL pública permanente.';
comment on column public.listings.preco_real is
  'Preço em moeda real, armazenado com duas casas decimais e sem conversão para GEMN.';
comment on column public.listings.preco_gemn is
  'Preço independente em GEMN, armazenado com duas casas decimais.';

-- Atualiza o timestamp e torna seller_id imutável após a criação. A função
-- também reforça, para qualquer caminho de escrita, as condições de
-- publicação que não devem depender somente da interface ou do RLS.
create or replace function public.validate_listing_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seller_status text;
  v_category_active boolean;
begin
  if tg_op = 'UPDATE' and new.seller_id is distinct from old.seller_id then
    raise exception using
      errcode = 'P0001',
      message = 'seller_id não pode ser alterado';
  end if;

  new.atualizado_em := now();

  if new.status = 'ativo' then
    select s.status
      into v_seller_status
      from public.sellers as s
     where s.id = new.seller_id;

    if v_seller_status is distinct from 'ativo' then
      raise exception using
        errcode = 'P0001',
        message = 'listing ativo exige seller ativo';
    end if;

    select c.ativo
      into v_category_active
      from public.categories as c
     where c.id = new.category_id;

    if v_category_active is distinct from true then
      raise exception using
        errcode = 'P0001',
        message = 'listing ativo exige categoria ativa';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_listings_write
  before insert or update on public.listings
  for each row
  execute function public.validate_listing_write();

alter table public.listings enable row level security;

-- Marketplace: somente listings ativos de sellers ativos e categorias ativas.
create policy listings_select_marketplace
  on public.listings
  for select
  to authenticated
  using (
    status = 'ativo'
    and exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.status = 'ativo'
    )
    and exists (
      select 1
        from public.categories as c
       where c.id = category_id
         and c.ativo = true
    )
  );

-- O próprio seller também pode consultar seus rascunhos e listings inativos.
create policy listings_select_own_seller
  on public.listings
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.user_id = (select auth.uid())
    )
  );

-- O seller do usuário pode criar rascunhos/inativos. Publicação exige seller
-- ativo e categoria ativa, tanto nesta policy quanto no trigger.
create policy listings_insert_own_seller
  on public.listings
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.user_id = (select auth.uid())
    )
    and (
      status <> 'ativo'
      or (
        exists (
          select 1
            from public.sellers as s
           where s.id = seller_id
             and s.status = 'ativo'
        )
        and exists (
          select 1
            from public.categories as c
           where c.id = category_id
             and c.ativo = true
        )
      )
    )
  );

-- UPDATE usa a policy antiga para confirmar a posse e a policy nova para
-- validar o estado final. seller_id não está no grant de UPDATE e também é
-- protegido pelo trigger.
create policy listings_update_own_seller
  on public.listings
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and s.user_id = (select auth.uid())
    )
    and (
      status <> 'ativo'
      or (
        exists (
          select 1
            from public.sellers as s
           where s.id = seller_id
             and s.status = 'ativo'
        )
        and exists (
          select 1
            from public.categories as c
           where c.id = category_id
             and c.ativo = true
        )
      )
    )
  );

-- Não há policy de DELETE: o histórico deve ser preservado com status
-- inativo. O trigger controla atualizado_em; id e criado_em não recebem
-- privilégios de UPDATE.
revoke all on table public.listings from anon, authenticated;

grant select (
  id,
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  imagem_principal,
  status,
  criado_em,
  atualizado_em
)
on table public.listings
to authenticated;

grant insert (
  seller_id,
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  imagem_principal,
  status
)
on table public.listings
to authenticated;

grant update (
  category_id,
  tipo,
  nome,
  descricao,
  preco_real,
  aceita_gemn,
  preco_gemn,
  imagem_principal,
  status
)
on table public.listings
to authenticated;

revoke all on function public.validate_listing_write() from public;
