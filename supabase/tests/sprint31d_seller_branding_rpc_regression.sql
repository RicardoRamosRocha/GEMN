-- GEMN: regressão para a ambiguidade 42702 da RPC de branding.
--
-- Este teste é somente contratual e não executa a RPC nem altera dados.
-- Deve ser executado após a migration corretiva, em banco local/isolado.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_definition text;
  v_normalized text;
begin
  select pg_get_functiondef('public.set_seller_branding(text,text)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'set_seller_branding(text,text) is missing';
  end if;

  v_normalized := regexp_replace(v_definition, '\s+', ' ', 'g');

  if v_normalized ~* 'on conflict\s*\(\s*seller_id\s*\)' then
    raise exception 'regression: unqualified ON CONFLICT (seller_id) remains and may raise 42702';
  end if;

  if v_normalized !~* 'on conflict on constraint seller_branding_pkey' then
    raise exception 'regression: seller_branding primary-key conflict target is not explicit';
  end if;

  if position('auth.uid()' in v_definition) = 0
     or position('v_seller.status <> ''ativo''' in v_definition) = 0
     or position('storage.objects' in v_definition) = 0
     or position('returning b.seller_id' in v_definition) = 0 then
    raise exception 'regression: security or qualified-returning checks are missing';
  end if;

  if has_function_privilege('anon', 'public.set_seller_branding(text,text)', 'EXECUTE') then
    raise exception 'regression: anon must not execute branding RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.set_seller_branding(text,text)', 'EXECUTE') then
    raise exception 'regression: authenticated must execute branding RPC';
  end if;
end;
$$;

rollback;
