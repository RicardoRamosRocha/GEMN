-- GEMN: categorias iniciais do marketplace.
-- Não altera categorias existentes: o conflito usa o mesmo critério do índice
-- único lower(btrim(nome)).

insert into public.categories (nome)
values
  ('Comida'),
  ('Serviços'),
  ('Moda'),
  ('Casa'),
  ('Outros')
on conflict (lower(btrim(nome))) do nothing;
