# GEMN — Marketplace da Comunidade Mundo Novo

## 1. Visão Geral

O GEMN será uma plataforma Web e Mobile destinada a conectar empresários, empreendedores, membros da comunidade e clientes.

O marketplace permitirá a divulgação e a comercialização de produtos e serviços oferecidos pelos vendedores aprovados. O acesso estará disponível pela Web e por dispositivos Mobile, de acordo com a evolução do produto.

Entre os recursos previstos estão:

- pagamentos em dinheiro/Real;
- utilização da moeda GEMN;
- benefícios e cashback em uma etapa futura;
- acesso por Web e Mobile.

As funcionalidades financeiras, incluindo as regras de utilização da moeda GEMN, benefícios, cashback e demais condições relacionadas, ainda terão suas regras detalhadas em etapas posteriores. Este documento não define taxas, valores ou regras financeiras que ainda não foram aprovadas pelo grupo GEMN.

## 2. Perfis de Usuário

### Cliente

Qualquer pessoa poderá criar uma conta na plataforma. O Cliente poderá:

- navegar pelo marketplace;
- comprar produtos e serviços;
- acompanhar seus pedidos;
- utilizar os recursos disponíveis aos clientes.

O Cliente não poderá publicar produtos ou serviços.

### Membro GEMN

Somente usuários aprovados pelo GEMN poderão se tornar vendedores. O Membro GEMN terá todas as funcionalidades de Cliente e também poderá:

- cadastrar produtos e serviços;
- administrar seus anúncios;
- receber pedidos;
- possuir um perfil do negócio;
- participar dos recursos relacionados à moeda GEMN, conforme as regras futuras.

Um Membro GEMN pode ser de um dos seguintes tipos:

| Tipo de membro/vendedor | Descrição |
| --- | --- |
| Empreendedor | Pessoa responsável por um negócio ou atividade empreendedora. |
| Empresa | Negócio formalizado identificado por sua razão social e CNPJ. |

Empreendedor e Empresa não são níveis de permissão diferentes. São tipos diferentes de membro/vendedor, sujeitos ao mesmo processo de aprovação para vender na plataforma.

### Administrador GEMN

O Administrador GEMN é responsável pela administração da plataforma. Pode:

- analisar solicitações de vendedores;
- aprovar vendedores;
- recusar solicitações;
- suspender vendedores;
- administrar usuários;
- administrar categorias;
- administrar anúncios;
- futuramente, administrar regras da moeda GEMN e benefícios.

## 3. Entrada na Plataforma

Qualquer pessoa entra inicialmente na plataforma como Cliente:

```text
Criar conta
    ↓
Cliente
```

O cadastro como Cliente não concede permissão para publicar produtos ou serviços. Para vender, será necessário solicitar a aprovação do GEMN.

## 4. Quero vender no GEMN

O Cliente poderá iniciar uma solicitação de vendedor pelo recurso “Quero vender no GEMN”:

```text
Cliente
    ↓
Quero vender no GEMN
    ↓
Escolhe Empreendedor ou Empresa
    ↓
Preenche os dados
    ↓
Solicitação Pendente
    ↓
Administrador analisa
    ↓
Aprovação ou Recusa
```

Marcar a opção “Sou membro GEMN” não concede automaticamente permissão de vendedor. A capacidade de vender somente será liberada após a análise e a aprovação da solicitação pelo Administrador GEMN.

## 5. Dados de Cadastro

### Cliente

O cadastro inicial do Cliente deverá conter:

- Nome completo;
- E-mail;
- Telefone/WhatsApp;
- Senha.

Não será exigido CPF inicialmente.

### Empreendedor

A solicitação de vendedor como Empreendedor deverá conter:

- Nome do responsável;
- CPF;
- Telefone/WhatsApp;
- Nome do negócio;
- Categoria de atuação;
- Descrição.

### Empresa

A solicitação de vendedor como Empresa deverá conter:

- Nome/Razão social;
- CNPJ;
- Responsável;
- Telefone/WhatsApp;
- Categoria de atuação;
- Descrição.

O cadastro inicial não deverá solicitar endereço completo. Os endereços serão tratados posteriormente, no fluxo de pedidos e entregas.

## 6. Aprovação de Vendedores

Os estados previstos para a solicitação e a situação do vendedor são:

```text
             ┌──→ Aprovado ──→ Suspenso
Pendente ────┤
             └──→ Recusado
```

De forma funcional:

| Estado | Significado |
| --- | --- |
| Pendente | Solicitação enviada pelo Cliente e ainda não analisada pelo Administrador GEMN. |
| Aprovado | Usuário autorizado a atuar como vendedor e publicar produtos ou serviços. |
| Recusado | Solicitação não aprovada pelo Administrador GEMN. |
| Suspenso | Vendedor que perdeu temporariamente a capacidade de vender. |

Um vendedor suspenso continua tendo acesso à sua conta como Cliente, mas perde temporariamente a capacidade de vender, publicar ou manter suas atividades de vendedor conforme as regras administrativas da plataforma.

## 7. Produtos e Serviços

Vendedores aprovados poderão cadastrar produtos ou serviços. Inicialmente, cada anúncio deverá conter:

- Nome;
- Descrição;
- Tipo: Produto ou Serviço;
- Categoria;
- Preço em Real;
- Aceita moeda GEMN;
- Valor em GEMN, quando aplicável;
- Foto principal;
- Status do anúncio.

Para o MVP, será prevista inicialmente uma foto principal por anúncio. No futuro, o marketplace poderá permitir múltiplas imagens.

As regras de uso da moeda GEMN e a aplicação do valor em GEMN ainda serão detalhadas posteriormente. Este documento não estabelece conversões, paridades, taxas ou outras regras financeiras.

## 8. Fluxo resumido

Fluxo de entrada e compra:

```text
Visitante
    ↓
Cadastro
    ↓
Cliente
    ↓
Compra no Marketplace
```

Fluxo de habilitação para venda:

```text
Cliente
    ↓
Quero vender no GEMN
    ↓
Solicitação
    ↓
Administrador
    ↓
Aprovado
    ↓
Membro GEMN
    ↓
Publica Produtos/Serviços
```

## 9. Próximas Etapas

As próximas etapas previstas para a evolução do projeto são:

1. Modelagem do banco de dados;
2. Configuração do Supabase/PostgreSQL;
3. Autenticação;
4. Processo de aprovação de vendedores;
5. Persistência real de produtos e serviços;
6. Supabase Storage para imagens;
7. Pedidos;
8. Carteira/Moeda GEMN;
9. Cashback e benefícios.

Este documento representa as decisões funcionais atuais do MVP e poderá evoluir conforme a validação do grupo GEMN.
