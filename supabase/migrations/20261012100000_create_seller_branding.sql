-- GEMN: identidade visual opcional das lojas.
--
-- Os caminhos são referências internas ao Storage. A autorização para
-- alterar referências usa auth.uid() e não depende de dados enviados pelo
-- cliente, como user_id, papel ou status.

create table public.seller_branding (
  seller_id uuid primary key references public.sellers (id) on delete cascade,
  logo_path text,
  banner_path text,
  atualizado_em timestamptz not null default now(),
  constraint seller_branding_logo_path_check
    check (
      logo_path is null
      or logo_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    ),
  constraint seller_branding_banner_path_check
    check (
      banner_path is null
      or banner_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/banner/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    )
);

comment on table public.seller_branding is
  'Referências internas de logo e banner de um seller; arquivos ficam no Storage.';
comment on column public.seller_branding.logo_path is
  'Caminho seller_id/logo/uuid.ext no bucket seller-branding.';
comment on column public.seller_branding.banner_path is
  'Caminho seller_id/banner/uuid.ext no bucket seller-branding.';

create or replace function public.set_seller_branding_updated_at()
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

create trigger set_seller_branding_updated_at
  before update on public.seller_branding
  for each row
  execute function public.set_seller_branding_updated_at();

alter table public.seller_branding enable row level security;

-- Compradores autenticados só veem branding de sellers ativos. O proprietário
-- também pode visualizar o próprio branding enquanto estiver suspenso.
create policy seller_branding_select_authorized
  on public.seller_branding
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.sellers as s
       where s.id = seller_id
         and (
           s.status = 'ativo'
           or s.user_id = (select auth.uid())
         )
    )
  );

-- Não há INSERT, UPDATE ou DELETE direto para authenticated. A RPC abaixo é
-- o único caminho de alteração das referências.
revoke all on table public.seller_branding from anon, authenticated;

grant select (
  seller_id,
  logo_path,
  banner_path,
  atualizado_em
)
on table public.seller_branding
to authenticated;

revoke all on function public.set_seller_branding_updated_at() from public;

create or replace function public.set_seller_branding(
  p_logo_path text,
  p_banner_path text
)
returns table (
  seller_id uuid,
  logo_path text,
  banner_path text,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller public.sellers%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado é obrigatório';
  end if;

  select s.*
    into v_seller
    from public.sellers as s
   where s.user_id = v_user_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'usuário autenticado não possui vendedor';
  end if;

  if v_seller.status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'vendedor suspenso não pode alterar a identidade visual';
  end if;

  if p_logo_path is not null then
    if p_logo_path !~* ('^' || v_seller.id::text || '/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$') then
      raise exception using
        errcode = 'P0001',
        message = 'caminho de logo inválido ou pertencente a outro vendedor';
    end if;

    if not exists (
      select 1
        from storage.objects as o
       where o.bucket_id = 'seller-branding'
         and o.name = p_logo_path
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'arquivo de logo não encontrado no Storage';
    end if;
  end if;

  if p_banner_path is not null then
    if p_banner_path !~* ('^' || v_seller.id::text || '/banner/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$') then
      raise exception using
        errcode = 'P0001',
        message = 'caminho de banner inválido ou pertencente a outro vendedor';
    end if;

    if not exists (
      select 1
        from storage.objects as o
       where o.bucket_id = 'seller-branding'
         and o.name = p_banner_path
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'arquivo de banner não encontrado no Storage';
    end if;
  end if;

  return query
  insert into public.seller_branding as b (
    seller_id,
    logo_path,
    banner_path
  )
  values (
    v_seller.id,
    p_logo_path,
    p_banner_path
  )
  on conflict (seller_id) do update
    set logo_path = excluded.logo_path,
        banner_path = excluded.banner_path
  returning b.seller_id, b.logo_path, b.banner_path, b.atualizado_em;
end;
$$;

comment on function public.set_seller_branding(text, text) is
  'Atualiza referências de logo e banner somente para o seller ativo do usuário autenticado.';

revoke all on function public.set_seller_branding(text, text)
  from public, anon, authenticated;
grant execute on function public.set_seller_branding(text, text)
  to authenticated;
