# GEMN

## Marketplace da Comunidade Mundo Novo

![React Native](https://img.shields.io/badge/React_Native-0.86.3-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-57.0.0-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white)
![Web + Mobile](https://img.shields.io/badge/Web%20%2B%20Mobile-em%20desenvolvimento-1B5E20)
![Status](https://img.shields.io/badge/status-em%20desenvolvimento-F59E0B)

O GEMN nasce para aproximar pessoas, empreendedores e empresas ligados à Comunidade Mundo Novo por meio de um marketplace acessível pela Web e por dispositivos móveis.

O projeto está em desenvolvimento. A interface e os principais fluxos do protótipo já estão sendo construídos, enquanto a persistência real dos dados e os serviços de backend fazem parte da próxima etapa.

## 💡 A ideia

O GEMN pretende criar um ecossistema no qual a comunidade possa encontrar produtos e serviços oferecidos por empreendedores e empresas do grupo.

Ao fortalecer essa rede de negócios, a plataforma poderá aproximar clientes e vendedores e abrir novas oportunidades dentro da própria comunidade.

## 🎯 Objetivos

- conectar clientes, empreendedores e empresas;
- divulgar produtos e serviços;
- facilitar compras e contratações dentro da comunidade;
- oferecer acesso Web e Mobile;
- preparar o ecossistema para a moeda GEMN;
- possibilitar benefícios e cashback futuramente;
- fortalecer a rede de empreendedores do GEMN.

Os recursos relacionados à moeda GEMN, cashback e benefícios ainda dependem de definição e validação pelo grupo GEMN. Eles não são apresentados como funcionalidades financeiras já implementadas.

## 📱 Plataforma

O projeto está sendo construído com uma única base utilizando React Native + Expo, atendendo:

- 📱 Android;
- 🌐 Web.

Essa abordagem permite que o marketplace seja acessado pelo celular e pelo computador, mantendo uma base compartilhada para a evolução do produto. O suporte final a outras plataformas ainda não é afirmado neste README.

## ✨ Experiência planejada

Fluxo de compra:

```text
Cliente
   ↓
Marketplace
   ↓
Produtos e Serviços
   ↓
Pedido
```

Fluxo para se tornar vendedor:

```text
Cliente
   ↓
Quero vender no GEMN
   ↓
Análise do GEMN
   ↓
Membro aprovado
   ↓
Publicação de Produtos e Serviços
```

Qualquer pessoa poderá ser Cliente. Somente membros/vendedores aprovados pelo GEMN poderão publicar produtos ou serviços. Marcar que pertence ao GEMN não concede automaticamente permissão de vendedor.

## 🛍️ Marketplace

### O que já existe no protótipo

O protótipo atual possui telas e fluxos relacionados a:

- Home;
- Marketplace;
- detalhes de produto ou serviço;
- Perfil;
- Meus Produtos;
- cadastro de produto ou serviço;
- Pedidos;
- confirmação de pedido;
- navegação responsiva Web/Mobile.

Essas telas representam a experiência e os fluxos do protótipo. Os dados ainda não estão persistidos em um banco de dados real.

### Próxima evolução

A persistência real com Supabase será a próxima grande etapa. Ela deverá sustentar usuários, solicitações de vendedor, anúncios, pedidos, endereços e demais dados de negócio conforme a modelagem aprovada.

## 💰 Moeda GEMN

A arquitetura está sendo preparada para suportar uma moeda própria do ecossistema GEMN.

- as regras da moeda ainda serão definidas e validadas;
- nenhuma paridade automática com o Real está definida;
- cashback e benefícios são evoluções planejadas;
- a implementação financeira acontecerá somente após a definição das regras pelo grupo GEMN.

Este projeto não define valores, taxas, conversões ou outras regras financeiras ainda não aprovadas.

## 👥 Perfis

### Cliente

Pode acessar o marketplace e realizar compras ou contratações.

### Membro GEMN

É o vendedor aprovado pelo GEMN. Pode ser:

- Empreendedor;
- Empresa.

Após a aprovação, poderá publicar e administrar seus produtos e serviços.

### Administrador GEMN

É responsável pela administração da plataforma e pela análise e aprovação dos vendedores.

Ninguém se torna vendedor simplesmente por marcar que pertence ao GEMN. Existe um processo de solicitação, análise e aprovação.

## 🧱 Tecnologias

### Atualmente

- React Native;
- Expo;
- TypeScript;
- React Navigation;
- React Native Web.

### Próxima etapa / arquitetura planejada

- Supabase;
- PostgreSQL;
- Supabase Auth;
- Supabase Storage.

Supabase, PostgreSQL, Supabase Auth e Supabase Storage ainda não são apresentados como implementados no protótipo atual.

## 🏗️ Arquitetura

Visão conceitual da solução:

```text
                GEMN
                  │
        ┌─────────┴─────────┐
        │                   │
     Mobile                Web
        │                   │
        └─────────┬─────────┘
                  │
          React Native + Expo
                  │
                  ▼
              Supabase
          (próxima etapa)
          ┌───────┼────────┐
          │       │        │
        Auth   PostgreSQL Storage
```

O bloco Supabase representa a arquitetura planejada para a próxima etapa. A implementação ainda deverá transformar a modelagem conceitual em uma estrutura física PostgreSQL, com autenticação, segurança, Storage e persistência reais.

## 🗺️ Roadmap

### ✅ Concluído / Protótipo

- estrutura React Native + Expo;
- suporte Web;
- navegação principal;
- Home;
- Marketplace;
- detalhes de anúncio;
- Perfil;
- Meus Produtos;
- cadastro de produto/serviço;
- fluxo de pedido;
- interface responsiva;
- definição dos perfis e acessos;
- modelagem conceitual do banco.

### 🚧 Próxima etapa

- configuração do Supabase;
- PostgreSQL;
- autenticação real;
- políticas de segurança;
- persistência de usuários;
- aprovação real de vendedores;
- persistência dos anúncios;
- Storage para imagens.

### 🔮 Evoluções

- carteira GEMN;
- transações GEMN;
- cashback;
- avaliações;
- múltiplas imagens;
- recursos específicos para contratação ou agendamento de serviços;
- melhorias de entrega e logística.

## 📚 Documentação

- [Visão geral e perfis de acesso](docs/01-visao-geral-e-perfis-de-acesso.md) — decisões funcionais do marketplace, perfis, fluxos de entrada e aprovação de vendedores.
- [Modelagem do banco de dados](docs/02-modelagem-do-banco-de-dados.md) — modelagem conceitual do MVP, entidades, relacionamentos e decisões de segurança antes da implementação no Supabase/PostgreSQL.

## 🚀 Executando o projeto

### Pré-requisitos

- Node.js;
- npm.

### Instalação

```bash
npm install
```

### Inicialização

```bash
npx expo start
```

Com os scripts atualmente definidos no projeto, também é possível iniciar diretamente:

```bash
npm run web
npm run android
```

## 📂 Estrutura

```text
GEMN/
├── App.tsx
├── src/
│   ├── components/
│   ├── context/
│   ├── screens/
│   └── theme/
├── docs/
├── assets/
└── package.json
```

## 🤝 Projeto GEMN

O GEMN utiliza tecnologia para aproximar pessoas, fortalecer empreendedores e construir novas possibilidades dentro da Comunidade Mundo Novo.
