# GEMN — Modelagem Conceitual do Banco de Dados

## 1. Objetivo

Este documento registra a modelagem conceitual aprovada para o MVP do GEMN — Marketplace da Comunidade Mundo Novo, antes da implementação no Supabase/PostgreSQL.

O objetivo é organizar as entidades de negócio, seus principais atributos, relacionamentos e regras conceituais, servindo como referência para desenvolvedores e para a documentação do projeto.

Detalhes físicos, como tipos SQL, índices, constraints, políticas de Row Level Security (RLS) e migrations, serão definidos durante a implementação. Este documento não contém SQL nem representa uma definição física final do banco de dados.

## 2. Visão Geral

O Supabase Auth será responsável pelos recursos de autenticação, incluindo:

- autenticação;
- e-mail;
- senha;
- recuperação de senha;
- segurança de autenticação.

A aplicação terá tabelas próprias para os dados de negócio, como perfis, solicitações de vendedor, vendedores, anúncios, pedidos e endereços.

Visão conceitual dos principais relacionamentos:

```text
Supabase Auth
      │
      ▼
   profiles
      │
      ├──────────────► addresses
      ├──────────────► favorites
      │
      ▼
seller_applications
      │
      │ aprovação
      ▼
   sellers
      │
      └──────────────► listings ◄──────── categories

orders
  │
  └──► order_items
           │
           └──► listings
```

As seguintes entidades ficam preparadas ou planejadas para evolução:

- `wallets`;
- `wallet_transactions`;
- `reviews`;
- `admin_audit_logs`.

## 3. Perfis de Usuário — `profiles`

A entidade `profiles` representa os dados de negócio associados ao usuário autenticado no Supabase Auth.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador relacionado ao usuário do Supabase Auth. |
| `nome_completo` | Nome completo do usuário. |
| `telefone` | Telefone ou WhatsApp do usuário. |
| `perfil` | Perfil de acesso do usuário. |
| `criado_em` | Data e hora de criação do perfil. |
| `atualizado_em` | Data e hora da última atualização. |

### Valores de `perfil`

- `cliente`;
- `membro`;
- `admin`.

O campo `id` estará relacionado ao usuário correspondente do Supabase Auth. A senha não será armazenada em `profiles`.

Todos os usuários entram inicialmente como `cliente`. Um usuário comum não poderá promover a própria conta para `membro` ou `admin`. As permissões também serão protegidas pelas regras de segurança do banco.

## 4. Solicitações de Vendedor — `seller_applications`

`seller_applications` registra a solicitação feita por um Cliente que deseja vender no GEMN.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador da solicitação. |
| `user_id` | Usuário que enviou a solicitação. |
| `tipo_membro` | Tipo de membro/vendedor solicitado. |
| `nome_negocio` | Nome do negócio informado na solicitação. |
| `cpf` | CPF informado para uma solicitação de Empreendedor. |
| `cnpj` | CNPJ informado para uma solicitação de Empresa. |
| `responsavel` | Responsável pela atividade ou empresa. |
| `telefone` | Telefone ou WhatsApp informado. |
| `categoria` | Categoria de atuação informada. |
| `descricao` | Descrição do negócio e de sua atuação. |
| `status` | Situação da solicitação. |
| `observacao_admin` | Observação registrada pelo Administrador GEMN. |
| `criado_em` | Data e hora de criação da solicitação. |
| `analisado_em` | Data e hora da análise. |
| `analisado_por` | Administrador responsável pela análise. |

### Valores de `tipo_membro`

- `empreendedor`;
- `empresa`.

### Valores de `status`

- `pendente`;
- `aprovado`;
- `recusado`.

Uma solicitação `pendente` poderá resultar em `aprovado` ou `recusado`. `suspenso` não pertence à solicitação: suspensão é um estado posterior do vendedor aprovado.

O CPF será utilizado para solicitações do tipo `empreendedor`. O CNPJ será utilizado para solicitações do tipo `empresa`.

CPF é dado pessoal e não deverá ser exposto publicamente. A implementação deverá aplicar controles adequados de acesso e segurança.

## 5. Vendedores/Membros GEMN — `sellers`

`sellers` representa o vendedor aprovado pelo GEMN. Um registro de vendedor somente será criado após a aprovação da solicitação correspondente.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do vendedor. |
| `user_id` | Usuário associado ao vendedor. |
| `application_id` | Solicitação aprovada que originou o vendedor. |
| `tipo_membro` | Tipo do membro: Empreendedor ou Empresa. |
| `nome_negocio` | Nome do negócio. |
| `descricao` | Descrição do negócio. |
| `telefone` | Telefone ou WhatsApp do negócio. |
| `status` | Situação atual do vendedor. |
| `criado_em` | Data e hora de criação. |
| `atualizado_em` | Data e hora da última atualização. |

### Valores de `status`

- `ativo`;
- `suspenso`.

Após a aprovação, `profiles.perfil` passa de `cliente` para `membro`. CPF e CNPJ não precisam ser duplicados em `sellers`, pois foram informados na solicitação de vendedor.

Um vendedor suspenso mantém sua conta e seu histórico, mas perde temporariamente a capacidade de vender. Posteriormente, o vendedor poderá voltar de `suspenso` para `ativo`.

## 6. Categorias — `categories`

`categories` representa as categorias utilizadas para organizar produtos e serviços do marketplace.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador da categoria. |
| `nome` | Nome da categoria. |
| `ativo` | Indica se a categoria está disponível para uso. |
| `criado_em` | Data e hora de criação. |

As categorias serão administradas pelo GEMN e utilizadas para organizar produtos e serviços.

## 7. Produtos e Serviços — `listings`

Será utilizado o nome `listings` porque a mesma entidade representa produtos e serviços publicados por vendedores aprovados.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do anúncio. |
| `seller_id` | Vendedor responsável pelo anúncio. |
| `category_id` | Categoria do anúncio. |
| `tipo` | Indica se o anúncio é produto ou serviço. |
| `nome` | Nome do produto ou serviço. |
| `descricao` | Descrição do produto ou serviço. |
| `preco_real` | Preço em Real. |
| `aceita_gemn` | Indica se o anúncio aceita moeda GEMN. |
| `preco_gemn` | Valor em GEMN, quando aplicável. |
| `imagem_principal` | Referência da foto principal. |
| `status` | Situação do anúncio. |
| `criado_em` | Data e hora de criação. |
| `atualizado_em` | Data e hora da última atualização. |

### Valores de `tipo`

- `produto`;
- `servico`.

### Status inicial previsto

- `rascunho`;
- `ativo`;
- `inativo`.

### Regras conceituais

- `preco_real` não pode ser negativo;
- se `aceita_gemn` for falso, `preco_gemn` não deverá possuir valor;
- somente vendedores ativos podem publicar;
- a exclusão ou suspensão do vendedor não deverá apagar automaticamente o histórico dos anúncios;
- o MVP utilizará inicialmente uma foto principal;
- a imagem será futuramente armazenada no Supabase Storage;
- a arquitetura poderá evoluir para múltiplas imagens.

## 8. Pedidos — `orders`

`orders` representa um pedido realizado por um Cliente. Produtos e Serviços poderão gerar pedidos no MVP.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do pedido. |
| `buyer_id` | Cliente responsável pela compra. |
| `status` | Situação do pedido. |
| `forma_pagamento` | Forma de pagamento utilizada. |
| `total_real` | Total do pedido em Real. |
| `total_gemn` | Total do pedido em moeda GEMN. |
| `tipo_entrega` | Tipo de entrega ou retirada. |
| `endereco_entrega_snapshot` | Cópia conceitual dos dados de entrega utilizados no momento da compra. |
| `criado_em` | Data e hora de criação. |
| `atualizado_em` | Data e hora da última atualização. |

`endereco_entrega_snapshot` representa conceitualmente uma cópia dos dados de entrega utilizados no momento da compra. A forma física desse snapshot — colunas próprias, estrutura composta ou outra solução PostgreSQL — será decidida na Etapa 3. Para pedidos com retirada, esse snapshot poderá não ser aplicável.

### Status inicialmente previstos

- `pendente`;
- `confirmado`;
- `concluido`;
- `cancelado`.

### Formas de pagamento inicialmente previstas

- `real`;
- `gemn`.

Pagamento misto não faz parte do primeiro MVP.

### Tipos de entrega inicialmente previstos

- `entrega`;
- `retirada`.

Agendamento específico de serviços ficará para uma evolução futura.

## 9. Itens do Pedido — `order_items`

`order_items` representa cada item incluído em um pedido.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do item do pedido. |
| `order_id` | Pedido ao qual o item pertence. |
| `listing_id` | Anúncio relacionado ao item. |
| `seller_id` | Vendedor responsável pelo item. |
| `nome_item` | Nome do item no momento da compra. |
| `tipo` | Tipo do item: produto ou serviço. |
| `quantidade` | Quantidade comprada. |
| `preco_real_unitario` | Preço unitário em Real no momento da compra. |
| `preco_gemn_unitario` | Preço unitário em GEMN no momento da compra. |
| `subtotal_real` | Subtotal do item em Real. |
| `subtotal_gemn` | Subtotal do item em GEMN. |

### Conceito de snapshot

Nome e preços devem ser preservados no pedido como um snapshot do momento da compra. Assim, alterações futuras no anúncio não modificarão os pedidos antigos.

## 10. Endereços — `addresses`

`addresses` representa os endereços que poderão ser utilizados nos pedidos e entregas.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do endereço. |
| `user_id` | Usuário proprietário do endereço. |
| `apelido` | Nome dado pelo usuário ao endereço. |
| `cep` | CEP. |
| `logradouro` | Logradouro. |
| `numero` | Número. |
| `complemento` | Complemento. |
| `bairro` | Bairro. |
| `cidade` | Cidade. |
| `estado` | Estado. |
| `referencia` | Ponto de referência. |
| `principal` | Indica se é o endereço principal. |
| `criado_em` | Data e hora de criação. |
| `atualizado_em` | Data e hora da última atualização. |

O endereço não é obrigatório no cadastro inicial. O usuário poderá possuir vários endereços.

O pedido deverá preservar os dados do endereço utilizado na compra. Uma alteração posterior do endereço do usuário não deverá modificar pedidos antigos.

Não fazem parte do MVP inicial o cálculo de frete, integrações com Correios, mapas ou cálculo de distância.

## 11. Favoritos — `favorites`

`favorites` registra os anúncios favoritos de cada usuário.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do favorito. |
| `user_id` | Usuário que favoritou o anúncio. |
| `listing_id` | Anúncio favoritado. |
| `criado_em` | Data e hora em que o favorito foi criado. |

### Regras conceituais

- o usuário poderá favoritar vários anúncios;
- o mesmo usuário não poderá favoritar o mesmo anúncio mais de uma vez.

Favoritos fazem parte do MVP.

## 12. Avaliações — `reviews`

Avaliações são uma evolução futura e não fazem parte da funcionalidade inicial do MVP.

### Estrutura conceitual planejada

| Campo | Descrição |
| --- | --- |
| `id` | Identificador da avaliação. |
| `user_id` | Usuário que realizou a avaliação. |
| `order_item_id` | Item de pedido relacionado. |
| `listing_id` | Anúncio avaliado. |
| `nota` | Nota atribuída. |
| `comentario` | Comentário da avaliação. |
| `criado_em` | Data e hora de criação. |

Futuramente deverá ser avaliado se apenas compradores com pedido concluído poderão avaliar. As regras definitivas ainda não serão definidas nesta etapa.

## 13. Carteira GEMN — `wallets`

`wallets` é uma estrutura planejada. Sua implementação financeira dependerá da aprovação das regras da moeda GEMN.

### Estrutura conceitual planejada

| Campo | Descrição |
| --- | --- |
| `id` | Identificador da carteira. |
| `user_id` | Usuário proprietário da carteira. |
| `saldo_gemn` | Saldo da carteira em moeda GEMN. |

Esta modelagem não assume paridade entre Real e GEMN e não define conversão automática.

## 14. Transações GEMN — `wallet_transactions`

`wallet_transactions` representará o histórico planejado de movimentações da carteira GEMN.

### Estrutura conceitual planejada

| Campo | Descrição |
| --- | --- |
| `id` | Identificador da transação. |
| `wallet_id` | Carteira relacionada. |
| `tipo` | Tipo da movimentação. |
| `valor` | Valor movimentado. |
| `descricao` | Descrição da movimentação. |
| `order_id` | Pedido relacionado, quando aplicável. |
| `criado_em` | Data e hora da movimentação. |

### Tipos possíveis planejados

- `credito`;
- `debito`;
- `cashback`;
- `ajuste`.

O histórico de movimentações permitirá rastrear por que o saldo foi alterado. As regras definitivas serão definidas posteriormente.

## 15. Auditoria Administrativa — `admin_audit_logs`

`admin_audit_logs` registrará ações administrativas importantes para manter a rastreabilidade da plataforma.

### Atributos conceituais

| Campo | Descrição |
| --- | --- |
| `id` | Identificador do registro de auditoria. |
| `admin_user_id` | Administrador que realizou a ação. |
| `acao` | Ação realizada. |
| `entidade` | Entidade afetada. |
| `entidade_id` | Identificador do registro afetado. |
| `descricao` | Descrição da ação. |
| `criado_em` | Data e hora do registro. |

Exemplos de ações rastreáveis:

- aprovação de vendedor;
- recusa de solicitação;
- suspensão de vendedor;
- reativação;
- futuros ajustes administrativos relacionados à moeda GEMN.

Usuários comuns não poderão criar ou modificar registros de auditoria.

## 16. Relacionamentos Principais

As cardinalidades abaixo representam a visão conceitual atual. Não devem ser tratadas como definição física definitiva quando houver algum detalhe ainda a validar na implementação.

| Relacionamento | Cardinalidade conceitual |
| --- | --- |
| Supabase Auth → `profiles` | 1:1 |
| `profiles` → `seller_applications` | 1:N |
| `profiles` → `addresses` | 1:N |
| `profiles` → `orders` | 1:N |
| `profiles` ↔ `listings` através de `favorites` | N:N |
| `seller_applications` → `sellers` | 0..1 |
| `sellers` → `listings` | 1:N |
| `categories` → `listings` | 1:N |
| `orders` → `order_items` | 1:N |
| `listings` → `order_items` | 1:N |

## 17. Decisões de Segurança

As decisões de segurança conceituais são:

- a senha pertence ao Supabase Auth;
- o usuário não pode atribuir a si mesmo o papel de membro ou admin;
- somente o Administrador GEMN pode aprovar vendedores;
- somente vendedor ativo pode publicar;
- CPF não será público;
- dados administrativos deverão ser protegidos;
- a RLS do Supabase será definida na implementação;
- operações sensíveis devem ser validadas no servidor ou no banco, não apenas na interface React Native.

## 18. Escopo do MVP

### Implementação inicial

- autenticação;
- `profiles`;
- `seller_applications`;
- `sellers`;
- `categories`;
- `listings`;
- imagem principal;
- `orders`;
- `order_items`;
- `addresses`;
- `favorites`.

### Preparado/planejado para evolução

- `reviews`;
- `wallets`;
- `wallet_transactions`;
- cashback;
- pagamento misto;
- múltiplas imagens;
- agendamento específico de serviços;
- cálculo automático de frete;
- integrações logísticas.

Administração e auditoria deverão evoluir conforme as ações administrativas forem implementadas.

## 19. Próxima Etapa

Após a validação desta modelagem, a próxima etapa será:

**Etapa 3 — Configuração do Supabase e transformação do modelo conceitual em modelo físico PostgreSQL.**

Nessa etapa serão definidos:

- tipos de dados;
- chaves primárias e estrangeiras;
- constraints;
- índices;
- enums ou alternativas;
- políticas RLS;
- Storage;
- migrations/SQL;
- integração com React Native/Expo/Web.

## Observação final

Este documento representa a modelagem conceitual atual do MVP GEMN e poderá evoluir após a validação do grupo GEMN.
