create or replace function public.set_seller_gemn_acceptance(
  p_aceita_gemn boolean
)
returns table (
  seller_id uuid,
  aceita_gemn boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller public.sellers%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'usuário autenticado é obrigatório';
  end if;

  if p_aceita_gemn is null then
    raise exception using errcode = 'P0001', message = 'aceitação GEMN deve ser informada';
  end if;

  select s.* into v_seller
    from public.sellers as s
   where s.user_id = v_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'vendedor do usuário não encontrado';
  end if;

  if p_aceita_gemn and v_seller.status <> 'ativo' then
    raise exception using errcode = 'P0001', message = 'vendedor suspenso não pode aceitar GEMN';
  end if;

  update public.sellers
     set aceita_gemn = p_aceita_gemn
   where id = v_seller.id
  returning id, sellers.aceita_gemn into seller_id, aceita_gemn;

  return next;
end;
$$;

comment on function public.set_seller_gemn_acceptance(boolean) is
  'Permite ao vendedor ativo configurar se aceita GEMN, sem escrita direta na tabela sellers.';

revoke all on function public.set_seller_gemn_acceptance(boolean)
  from public, anon, authenticated;
grant execute on function public.set_seller_gemn_acceptance(boolean)
  to authenticated;
