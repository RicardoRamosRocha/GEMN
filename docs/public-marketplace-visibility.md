# Visibilidade pública do Mercado GEMN

## Regra do MVP

O Mercado público exibe somente dados comerciais mínimos:

- vendedores com `sellers.status = 'ativo'`;
- categorias com `categories.ativo = true`;
- anúncios com `listings.status = 'ativo'`, vinculados a vendedor ativo e categoria ativa;
- metadados de imagens associados a anúncios publicáveis.

Não existe, neste MVP, uma coluna adicional de consentimento. A aprovação do vendedor e o status ativo são a autorização operacional para exposição pública.

## Dados públicos

O papel `anon` recebe `SELECT` por coluna somente para os campos necessários ao Mercado:

- vendedor: `id`, `nome_negocio`, `descricao`, `status`, `aceita_gemn`;
- categoria: `id`, `nome`, `ativo`;
- anúncio: identidade, descrição, tipo, preços, regras GEMN, imagem principal e status;
- imagem: `id`, `listing_id`, `storage_path`, `sort_order`, `is_primary`.

`user_id`, `application_id`, telefone, perfis, documentos, carteiras, pedidos, pagamentos e administração continuam privados.

## Imagens

O bucket `listing-images` permanece público temporariamente, conforme decisão do MVP. As policies de upload continuam exigindo usuário autenticado, seller ativo e caminho associado ao próprio anúncio; o bucket aceita somente JPEG, PNG e WebP até 5 MB.

O bucket `seller-branding` permanece privado. Branding público não é necessário para aplicar a primeira camada de leitura; vitrines sem URL assinada usam o fallback visual.

## Auditoria antes do DEV

O arquivo `supabase/tests/audit_public_listing_images.sql` lista, sem excluir, objetos do bucket `listing-images` que estejam órfãos, associados a anúncio inativo, seller suspenso ou categoria desativada. O resultado deve ser revisado antes de qualquer limpeza manual.

## Aplicação controlada no DEV

1. Confirmar backup/ponto de restauração do DEV.
2. Aplicar somente `supabase/migrations/20261023100000_prepare_public_marketplace_read.sql`.
3. Obter UUIDs de um seller ativo, anúncio ativo, anúncio inativo e seller suspenso.
4. Executar `supabase/tests/public_marketplace_read_security.sql` com conexão `postgres` local/DEV autorizada.
5. Executar `supabase/tests/audit_public_listing_images.sql` e guardar o relatório.
6. Testar Mercado, busca, categorias, detalhes, vitrines, login, checkout e painel autenticado.
7. Não executar `db reset`, limpeza automática ou alteração de Storage sem revisão do relatório.
