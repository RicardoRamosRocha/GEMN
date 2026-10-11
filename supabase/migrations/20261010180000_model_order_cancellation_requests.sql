-- GEMN Sprint 2.4C Etapa 4C.1: modelagem de solicitacoes de cancelamento.
-- Esta migration nao executa solicitacoes nem movimentacoes financeiras.

create table public.order_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  requested_by uuid not null references public.profiles (id),
  requester_role text not null,
  requester_seller_id uuid references public.sellers (id),
  motivo_solicitacao text not null,
  status text not null default 'pendente',
  idempotency_key uuid not null,
  decision_idempotency_key uuid,
  financial_execution_key uuid,
  decided_by uuid references public.profiles (id),
  motivo_decisao text,
  order_cancellation_id uuid references public.order_cancellations (id),
  erro_codigo text,
  erro_mensagem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  decidido_em timestamptz,
  constraint order_cancellation_requests_role_check
    check (requester_role in ('comprador', 'vendedor')),
  constraint order_cancellation_requests_status_check
    check (status in ('pendente', 'aprovada', 'rejeitada', 'execucao_falhou')),
  constraint order_cancellation_requests_requester_consistency_check
    check (
      (requester_role = 'comprador' and requester_seller_id is null)
      or (requester_role = 'vendedor' and requester_seller_id is not null)
    ),
  constraint order_cancellation_requests_reason_check
    check (btrim(motivo_solicitacao) <> ''),
  constraint order_cancellation_requests_decision_reason_check
    check (motivo_decisao is null or btrim(motivo_decisao) <> ''),
  constraint order_cancellation_requests_error_code_check
    check (erro_codigo is null or btrim(erro_codigo) <> ''),
  constraint order_cancellation_requests_error_message_check
    check (erro_mensagem is null or btrim(erro_mensagem) <> '')
);

comment on table public.order_cancellation_requests is
  'Solicitacoes auditaveis de cancelamento de pedidos confirmados; nao executa estorno financeiro.';
comment on column public.order_cancellation_requests.requester_seller_id is
  'Seller derivado pelo banco quando o solicitante e vendedor; nao e confiado ao cliente.';
comment on column public.order_cancellation_requests.financial_execution_key is
  'Chave estavel reservada para a futura chamada idempotente de cancel_confirmed_order.';
comment on column public.order_cancellation_requests.order_cancellation_id is
  'Preenchido somente depois de um estorno financeiro confirmado.';

create unique index order_cancellation_requests_active_order_unique
  on public.order_cancellation_requests (order_id)
  where status in ('pendente', 'execucao_falhou');

create unique index order_cancellation_requests_requester_key_unique
  on public.order_cancellation_requests (requested_by, idempotency_key);

create unique index order_cancellation_requests_decision_key_unique
  on public.order_cancellation_requests (decision_idempotency_key)
  where decision_idempotency_key is not null;

create unique index order_cancellation_requests_financial_key_unique
  on public.order_cancellation_requests (financial_execution_key)
  where financial_execution_key is not null;

create index order_cancellation_requests_order_created_idx
  on public.order_cancellation_requests (order_id, criado_em desc, id desc);

create index order_cancellation_requests_requester_created_idx
  on public.order_cancellation_requests (requested_by, criado_em desc, id desc);

create index order_cancellation_requests_seller_status_idx
  on public.order_cancellation_requests (requester_seller_id, status, criado_em desc)
  where requester_seller_id is not null;

create table public.order_cancellation_request_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.order_cancellation_requests (id),
  operacao text not null,
  idempotency_key uuid not null,
  executor_id uuid not null references public.profiles (id),
  resultado text not null,
  order_cancellation_id uuid references public.order_cancellations (id),
  erro_codigo text,
  erro_mensagem text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz not null default now(),
  constraint order_cancellation_request_attempts_operation_check
    check (operacao in ('aprovacao', 'rejeicao')),
  constraint order_cancellation_request_attempts_result_check
    check (resultado in ('sucesso', 'falha')),
  constraint order_cancellation_request_attempts_result_consistency_check
    check (
      (resultado = 'sucesso' and erro_codigo is null and erro_mensagem is null)
      or (resultado = 'falha' and erro_codigo is not null and erro_mensagem is not null)
    ),
  constraint order_cancellation_request_attempts_approval_link_check
    check (operacao <> 'aprovacao' or resultado <> 'sucesso' or order_cancellation_id is not null),
  constraint order_cancellation_request_attempts_rejection_link_check
    check (operacao <> 'rejeicao' or order_cancellation_id is null)
);

comment on table public.order_cancellation_request_attempts is
  'Historico imutavel de tentativas administrativas de aprovacao e rejeicao.';

create unique index order_cancellation_request_attempts_key_unique
  on public.order_cancellation_request_attempts (request_id, idempotency_key);

create index order_cancellation_request_attempts_request_created_idx
  on public.order_cancellation_request_attempts (request_id, criado_em desc, id desc);

create index order_cancellation_request_attempts_executor_created_idx
  on public.order_cancellation_request_attempts (executor_id, criado_em desc);

create or replace function public.validate_order_cancellation_request_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_status text;
  v_is_admin boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pendente' then
      raise exception using errcode = 'P0001', message = 'solicitacao nova deve iniciar pendente';
    end if;

    select o.status
      into v_order_status
      from public.orders as o
     where o.id = new.order_id;

    if v_order_status is distinct from 'confirmado' then
      raise exception using errcode = 'P0001', message = 'solicitacao exige pedido confirmado';
    end if;

    if new.requester_role = 'comprador' then
      if not exists (
        select 1 from public.orders as o
         where o.id = new.order_id
           and o.buyer_id = new.requested_by
      ) then
        raise exception using errcode = 'P0001', message = 'comprador nao pertence ao pedido';
      end if;
    else
      if not exists (
        select 1
          from public.sellers as s
          join public.order_items as oi on oi.seller_id = s.id
         where s.id = new.requester_seller_id
           and s.user_id = new.requested_by
           and oi.order_id = new.order_id
      ) then
        raise exception using errcode = 'P0001', message = 'vendedor nao pertence ao pedido';
      end if;
    end if;

    return new;
  end if;

  if new.id <> old.id
     or new.order_id <> old.order_id
     or new.requested_by <> old.requested_by
     or new.requester_role <> old.requester_role
     or new.requester_seller_id is distinct from old.requester_seller_id
     or new.motivo_solicitacao <> old.motivo_solicitacao
     or new.idempotency_key <> old.idempotency_key
     or new.criado_em <> old.criado_em then
    raise exception using errcode = 'P0001', message = 'historico da solicitacao e imutavel';
  end if;

  if old.status in ('aprovada', 'rejeitada') then
    raise exception using errcode = 'P0001', message = 'solicitacao terminal e imutavel';
  end if;

  if old.status = 'pendente' and new.status not in ('pendente', 'aprovada', 'rejeitada', 'execucao_falhou') then
    raise exception using errcode = 'P0001', message = 'transicao de status invalida';
  end if;

  if old.status = 'execucao_falhou' and new.status not in ('execucao_falhou', 'aprovada', 'rejeitada') then
    raise exception using errcode = 'P0001', message = 'transicao de falha invalida';
  end if;

  if new.status in ('aprovada', 'rejeitada', 'execucao_falhou') then
    if new.decided_by is null or new.decidido_em is null then
      raise exception using errcode = 'P0001', message = 'decisao exige executor e data';
    end if;

    select p.is_admin into v_is_admin
      from public.profiles as p
     where p.id = new.decided_by;
    if not coalesce(v_is_admin, false) then
      raise exception using errcode = 'P0001', message = 'executor da decisao nao e administrador';
    end if;
  end if;

  if new.status = 'aprovada' and new.order_cancellation_id is null then
    raise exception using errcode = 'P0001', message = 'aprovacao exige cancelamento financeiro';
  end if;

  if new.status = 'rejeitada' and (new.motivo_decisao is null or btrim(new.motivo_decisao) = '') then
    raise exception using errcode = 'P0001', message = 'rejeicao exige motivo';
  end if;

  if new.status = 'execucao_falhou'
     and (new.erro_codigo is null or new.erro_mensagem is null) then
    raise exception using errcode = 'P0001', message = 'falha exige codigo e mensagem';
  end if;

  return new;
end;
$$;

create trigger validate_order_cancellation_request_state
  before insert or update on public.order_cancellation_requests
  for each row
  execute function public.validate_order_cancellation_request_state();

create or replace function public.validate_order_cancellation_request_attempt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_admin boolean;
begin
  select p.is_admin into v_is_admin
    from public.profiles as p
   where p.id = new.executor_id;

  if not coalesce(v_is_admin, false) then
    raise exception using errcode = 'P0001', message = 'tentativa exige administrador';
  end if;

  if new.resultado = 'sucesso' and new.erro_codigo is not null then
    raise exception using errcode = 'P0001', message = 'tentativa de sucesso nao pode possuir erro';
  end if;

  return new;
end;
$$;

create trigger validate_order_cancellation_request_attempt
  before insert on public.order_cancellation_request_attempts
  for each row
  execute function public.validate_order_cancellation_request_attempt();

create or replace function public.prevent_order_cancellation_request_attempt_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'historico de tentativas e imutavel';
end;
$$;

create trigger prevent_order_cancellation_request_attempt_update
  before update on public.order_cancellation_request_attempts
  for each row execute function public.prevent_order_cancellation_request_attempt_mutation();

create trigger prevent_order_cancellation_request_attempt_delete
  before delete on public.order_cancellation_request_attempts
  for each row execute function public.prevent_order_cancellation_request_attempt_mutation();

create or replace function public.can_view_order_cancellation_request(
  p_order_id uuid,
  p_requester_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles as p
     where p.id = auth.uid() and p.is_admin
  )
  or exists (
    select 1 from public.orders as o
     where o.id = p_order_id and o.buyer_id = auth.uid()
  )
  or exists (
    select 1
      from public.sellers as s
      join public.order_items as oi on oi.seller_id = s.id
     where s.id = p_requester_seller_id
       and s.user_id = auth.uid()
       and oi.order_id = p_order_id
  );
$$;

alter table public.order_cancellation_requests enable row level security;
alter table public.order_cancellation_request_attempts enable row level security;

create policy order_cancellation_requests_select_authorized
  on public.order_cancellation_requests
  for select
  to authenticated
  using (public.can_view_order_cancellation_request(order_id, requester_seller_id));

create policy order_cancellation_request_attempts_select_authorized
  on public.order_cancellation_request_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.order_cancellation_requests as r
       where r.id = request_id
         and public.can_view_order_cancellation_request(r.order_id, r.requester_seller_id)
    )
  );

revoke all on table public.order_cancellation_requests from public, anon, authenticated;
revoke all on table public.order_cancellation_request_attempts from public, anon, authenticated;

grant select on table public.order_cancellation_requests to authenticated;
grant select on table public.order_cancellation_request_attempts to authenticated;

revoke all on function public.validate_order_cancellation_request_state() from public, anon, authenticated;
revoke all on function public.validate_order_cancellation_request_attempt() from public, anon, authenticated;
revoke all on function public.prevent_order_cancellation_request_attempt_mutation() from public, anon, authenticated;
revoke all on function public.can_view_order_cancellation_request(uuid, uuid) from public, anon, authenticated;
