Crie uma documentação funcional do projeto GEMN com base nas decisões já definidas.

Crie SOMENTE o arquivo:

docs/01-visao-geral-e-perfis-de-acesso.md

Não altere nenhum arquivo de código.

O documento deve ser escrito em português do Brasil e ser compreensível tanto para desenvolvedores quanto para empresários e membros do grupo GEMN.

Estruture o documento aproximadamente assim:

# GEMN — Marketplace da Comunidade Mundo Novo

## 1. Visão Geral

Explique que o GEMN será uma plataforma Web e Mobile destinada a conectar empresários, empreendedores, membros da comunidade e clientes.

O marketplace permitirá divulgação e comercialização de produtos e serviços.

Prever:
- pagamentos em dinheiro/Real
- moeda GEMN
- benefícios e cashback no futuro
- acesso Web e Mobile

Deixe claro que algumas funcionalidades financeiras ainda terão suas regras detalhadas em etapas posteriores.

## 2. Perfis de Usuário

Documente os três níveis:

### Cliente
Qualquer pessoa poderá criar uma conta.
Pode navegar pelo marketplace, comprar produtos e serviços, acompanhar pedidos e utilizar os recursos disponíveis aos clientes.

Não pode publicar produtos ou serviços.

### Membro GEMN
Somente usuários aprovados pelo GEMN poderão se tornar vendedores.

Um Membro GEMN pode ser:

- Empreendedor
- Empresa

Não são níveis de permissão diferentes, mas tipos diferentes de membro/vendedor.

Além das funcionalidades de Cliente, poderá:
- cadastrar produtos e serviços
- administrar seus anúncios
- receber pedidos
- possuir perfil do negócio
- participar dos recursos relacionados à moeda GEMN conforme as regras futuras

### Administrador GEMN
Responsável pela administração da plataforma.

Pode:
- analisar solicitações de vendedores
- aprovar vendedores
- recusar solicitações
- suspender vendedores
- administrar usuários
- administrar categorias
- administrar anúncios
- futuramente administrar regras da moeda GEMN e benefícios

## 3. Entrada na Plataforma

Documente o fluxo:

Criar conta
→ Cliente

Qualquer pessoa entra inicialmente como Cliente.

## 4. Quero vender no GEMN

Documente o fluxo:

Cliente
→ Quero vender no GEMN
→ Escolhe Empreendedor ou Empresa
→ Preenche os dados
→ Solicitação Pendente
→ Administrador analisa
→ Aprovação ou Recusa

Deixe explícito que marcar "Sou membro GEMN" não concede automaticamente permissão de vendedor.

## 5. Dados de Cadastro

### Cliente
- Nome completo
- E-mail
- Telefone/WhatsApp
- Senha

Não exigir CPF inicialmente.

### Empreendedor
- Nome do responsável
- CPF
- Telefone/WhatsApp
- Nome do negócio
- Categoria de atuação
- Descrição

### Empresa
- Nome/Razão social
- CNPJ
- Responsável
- Telefone/WhatsApp
- Categoria de atuação
- Descrição

Não solicitar endereço completo no cadastro inicial.
Endereços serão tratados posteriormente no fluxo de pedidos/entregas.

## 6. Aprovação de Vendedores

Estados previstos:

Pendente
→ Aprovado
→ Recusado

Também deve existir o estado:

Suspenso

Explique que um vendedor suspenso continua tendo acesso à conta como Cliente, mas perde temporariamente a capacidade de vender.

## 7. Produtos e Serviços

Registre que os vendedores aprovados poderão cadastrar produtos ou serviços contendo inicialmente:

- Nome
- Descrição
- Tipo: Produto ou Serviço
- Categoria
- Preço em Real
- Aceita moeda GEMN
- Valor em GEMN, quando aplicável
- Foto principal
- Status do anúncio

Para o MVP, prever inicialmente uma foto principal por anúncio.
No futuro poderá haver múltiplas imagens.

## 8. Fluxo resumido

Inclua um diagrama textual simples mostrando:

Visitante
→ Cadastro
→ Cliente
→ Compra no Marketplace

e

Cliente
→ Quero vender no GEMN
→ Solicitação
→ Administrador
→ Aprovado
→ Membro GEMN
→ Publica Produtos/Serviços

## 9. Próximas Etapas

Documente:

1. Modelagem do banco de dados
2. Configuração do Supabase/PostgreSQL
3. Autenticação
4. Processo de aprovação de vendedores
5. Persistência real de produtos e serviços
6. Supabase Storage para imagens
7. Pedidos
8. Carteira/Moeda GEMN
9. Cashback e benefícios

Inclua uma observação dizendo que este documento representa as decisões funcionais atuais do MVP e poderá evoluir conforme validação do grupo GEMN.

Use Markdown bem organizado, tabelas quando ajudarem e diagramas textuais simples.

Não invente regras financeiras, taxas, valores de cashback ou regras da moeda GEMN que ainda não foram definidas.

Ao terminar:
- execute git status --short
- confirme que somente docs/01-visao-geral-e-perfis-de-acesso.md foi criado
- não faça commit
- não faça push
