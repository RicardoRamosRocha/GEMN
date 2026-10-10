# GEMN — Carteira Digital e Cashback

**Documento de apresentação e regras de negócio**  
**Projeto:** GEMN — Marketplace dos empresários e empreendedores da Comunidade Católica Mundo Novo  
**Etapa:** Sprint 2.4 — Carteira GEMN  
**Status:** Diretrizes de negócio aprovadas; implementação da carteira ainda em planejamento  
**Atualização:** 10/10/2026

## 1. Visão geral

O GEMN é um marketplace com acesso pela Web e por dispositivos móveis, destinado a aproximar consumidores, empresários e empreendedores participantes da comunidade.

A **moeda GEMN** será utilizada como benefício de fidelização: compradores poderão recebê-la como **cashback** em compras elegíveis e utilizá-la posteriormente com vendedores participantes que aceitem essa modalidade.

Nesta primeira etapa, a carteira e suas operações serão **simuladas**, sem movimentação de dinheiro real, sem compra de moedas e sem liquidação financeira entre vendedores.

## 2. Objetivos da carteira

- Incentivar novas compras e a fidelização dos consumidores.
- Fortalecer a circulação de benefícios entre empreendedores participantes.
- Permitir que vendedores ofereçam cashback conforme sua estratégia comercial.
- Oferecer transparência sobre saldo, créditos e utilizações da moeda GEMN.
- Validar regras de negócio e segurança antes de qualquer integração financeira real.

## 3. Regras de negócio aprovadas

| Código | Regra | Descrição |
|---|---|---|
| RN-01 | Origem das moedas | Moedas GEMN serão concedidas como cashback em compras elegíveis. |
| RN-02 | Financiamento do cashback | O vendedor que oferece o cashback será responsável pelo benefício concedido. |
| RN-03 | Percentual de cashback | Cada vendedor poderá configurar o percentual de cashback oferecido. |
| RN-04 | Uso entre vendedores | O comprador poderá utilizar moedas GEMN em qualquer vendedor participante que aceite a moeda, não apenas naquele que concedeu o cashback. |
| RN-05 | Pedido pendente | Pedidos pendentes não geram crédito de cashback. |
| RN-06 | Crédito condicionado | O cashback somente poderá ser creditado após confirmação de pagamento no fluxo de simulação autorizado. |
| RN-07 | Ambiente simulado | Créditos, débitos e compensações serão fictícios nesta fase, sem transferência de valores reais. |
| RN-08 | Controle pelo servidor | O aplicativo não poderá definir diretamente saldos ou autorizar créditos e débitos sem validação no backend. |

## 4. Jornada proposta do comprador

1. O comprador acessa o marketplace e identifica o cashback oferecido por um vendedor.
2. Seleciona um produto ou serviço e cria o pedido.
3. Enquanto o pedido estiver **pendente**, nenhuma moeda GEMN é creditada.
4. Após uma **confirmação simulada e autorizada** do pagamento, o sistema registra o cashback correspondente.
5. O comprador acompanha os créditos e o saldo em sua carteira.
6. Em uma compra futura, poderá utilizar moedas GEMN com outro vendedor participante que as aceite, respeitando as regras de utilização a serem definidas.

> **Atenção:** a confirmação simulada não representa pagamento real. O fluxo de simulação deverá ser restrito a mecanismos de teste autorizados; o comprador não poderá confirmar livremente o próprio pedido.

## 5. Exemplo ilustrativo

**Compra A — geração de cashback**

- Compra na Padaria Parceira: **R$ 100,00**.
- Cashback configurado: **5%**.
- Benefício ilustrativo: **5 GEMN**.
- O crédito ocorre somente depois da confirmação simulada autorizada.

**Compra B — utilização em outro vendedor**

- Nova compra na Elétrica Parceira: **R$ 30,00**.
- O vendedor aceita moedas GEMN.
- O comprador utiliza **5 GEMN**, conforme as regras futuras de conversão e limites.

**Os valores acima são apenas exemplos.** A equivalência entre GEMN e reais, os limites de uso e as regras de compensação ainda não foram aprovados. Portanto, não se deve interpretar automaticamente 5 GEMN como R$ 5,00 de desconto definitivo.

## 6. Responsabilidades dos participantes

### Comprador

- Consultar seu saldo e histórico de movimentações.
- Receber cashback apenas de operações elegíveis e confirmadas no ambiente simulado.
- Utilizar moedas somente em vendedores participantes que as aceitem.

### Vendedor

- Definir o percentual de cashback oferecido, respeitando limites que venham a ser estabelecidos.
- Informar se aceita moedas GEMN nas compras.
- Consultar, futuramente, o histórico de benefícios concedidos e recebidos no modelo de compensação simulada.

### Administração GEMN

- Estabelecer regras gerais, limites e critérios de participação.
- Supervisionar o ambiente de testes e a integridade das movimentações.
- Definir, antes de qualquer operação real, o modelo de compensação entre vendedores e as condições financeiras e jurídicas aplicáveis.

## 7. Segurança e integridade — requisitos de implementação

Estas são **diretrizes técnicas propostas**, ainda sujeitas à análise do código e do banco de dados existentes:

- Registrar movimentações de crédito, débito e eventual reversão com histórico auditável.
- Processar alterações de saldo exclusivamente no servidor, em transações atômicas.
- Impedir saldo negativo e operações duplicadas por meio de validações e idempotência.
- Associar cashback ao pedido e preservar as condições aplicáveis no momento da compra.
- Impedir que um pedido pendente gere cashback.
- Restringir a confirmação simulada de pagamento a ações autorizadas.
- Proteger os dados de cada carteira por políticas de acesso apropriadas.
- Tratar cancelamentos e estornos sem apagar o histórico das movimentações.

## 8. Escopo da Sprint 2.4

| Etapa | Entrega planejada |
|---|---|
| 2.4A | Revisão das regras de negócio e análise técnica da integração com pedidos. |
| 2.4B | Modelagem das carteiras, transações, regras de cashback e compensação simulada. |
| 2.4C | Interface da carteira na Web e no Android. |
| 2.4D | Fluxos simulados de crédito, utilização e reversão, com testes. |
| 2.4E | Preparação conceitual para integrações futuras, sem pagamentos reais. |

**Fora do escopo nesta fase:** compra de moedas com dinheiro real, pagamentos reais, saques, transferências financeiras e liquidação automática entre vendedores.

## 9. Decisões pendentes

Antes de finalizar a implementação, será necessário aprovar:

1. **Equivalência da moeda:** como GEMN será convertido em descontos ou benefícios.
2. **Limites de cashback:** percentuais mínimos/máximos e eventuais restrições por produto ou vendedor.
3. **Limites de utilização:** percentual máximo de uma compra que poderá ser pago com moedas.
4. **Elegibilidade:** quais pedidos, produtos e situações permitem crédito e uso de moedas.
5. **Validade das moedas:** se haverá ou não expiração.
6. **Cancelamentos e estornos:** critérios de reversão quando moedas já tiverem sido utilizadas.
7. **Compensação entre vendedores:** forma de contabilizar, mesmo na simulação, quem concedeu o benefício e quem o aceitou.
8. **Governança:** quem poderá configurar regras globais e autorizar operações de teste.

## 10. Estado atual do projeto

As Sprints 2.2 e 2.3 entregaram a base de pedidos com Supabase local, incluindo criação e consulta de pedidos, com testes realizados na Web e no Android. O commit de referência é `29ac0d3` na branch `main`.

**A carteira GEMN ainda não foi implementada.** Este documento formaliza as decisões de produto e orienta a próxima fase de desenvolvimento. As migrations de pedidos no Supabase remoto ainda exigem uma etapa própria de publicação e validação.

---

**Resumo para apresentação:** O GEMN pretende criar uma rede de benefícios entre empreendedores: cada vendedor pode oferecer cashback, o comprador acumula moedas GEMN e poderá utilizá-las em outros negócios participantes. O MVP será inteiramente simulado para validar a experiência, a segurança e as regras de compensação antes de qualquer operação financeira real.
