-- GEMN Sprint 3.1-D Etapa 3: atualizacao segura do perfil comercial.
--
-- O cliente nao informa seller_id nem user_id. A linha alvo e sempre derivada
-- de auth.uid(), e a escrita passa exclusivamente por esta RPC.

create or replace function public.set_seller_profile(
  p_nome_negocio text,
  p_descricao text
)
returns table (
  seller_id uuid,
  nome_negocio text,
  descricao text,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome_negocio text;
  v_descricao text;
  v_seller public.sellers%rowtype;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'usuario autenticado e obrigatorio';
  end if;

  -- Normaliza espacos internos e nas extremidades. NULL representa descricao
  -- opcional e e persistido como texto vazio porque sellers.descricao e NOT NULL.
  v_nome_negocio := btrim(regexp_replace(coalesce(p_nome_negocio, ''), '[[:space:]]+', ' ', 'g'));
  v_descricao := btrim(regexp_replace(coalesce(p_descricao, ''), '[[:space:]]+', ' ', 'g'));

  if v_nome_negocio = '' then
    raise exception using
      errcode = 'P0001',
      message = 'nome do negocio e obrigatorio';
  end if;

  if char_length(v_nome_negocio) > 255 then
    raise exception using
      errcode = 'P0001',
      message = 'nome do negocio excede 255 caracteres';
  end if;

  if char_length(v_descricao) > 5000 then
    raise exception using
      errcode = 'P0001',
      message = 'descricao excede 5000 caracteres';
  end if;

  select s.*
    into v_seller
    from public.sellers as s
   where s.user_id = v_user_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'usuario autenticado nao possui vendedor';
  end if;

  if v_seller.status <> 'ativo' then
    raise exception using
      errcode = 'P0001',
      message = 'vendedor suspenso nao pode atualizar o perfil comercial';
  end if;

  return query
  update public.sellers as s
     set nome_negocio = v_nome_negocio,
         descricao = v_descricao
   where s.id = v_seller.id
  returning s.id, s.nome_negocio, s.descricao, s.atualizado_em;
end;
$$;

comment on function public.set_seller_profile(text, text) is
  'Atualiza somente nome_negocio e descricao do seller ativo do usuario autenticado.';

revoke all on function public.set_seller_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.set_seller_profile(text, text)
  to authenticated;
