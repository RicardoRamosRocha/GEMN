# GEMN — Carteira Digital e Cashback

**Documento de apresentação e regras de negócio**  
**Projeto:** GEMN — Marketplace dos empresários e empreendedores da Comunidade Católica Mundo Novo  
**Etapa:** Sprint 2.4 — Carteira GEMN  
**Status:** Regras principais de negócio aprovadas; implementação da carteira ainda em planejamento  
**Atualização:** 10/10/2026  
**Versão do documento:** 2.0

## 1. Visão geral

O GEMN é um marketplace acessível pela Web e por dispositivos móveis, criado para aproximar consumidores, empresários e empreendedores participantes da comunidade.

A **moeda GEMN** funcionará como benefício de fidelização. Compradores receberão moedas como **cashback** em compras elegíveis e poderão utilizá-las em outros estabelecimentos participantes que aceitem GEMN.

No MVP, a carteira, os créditos, os descontos e a compensação entre vendedores serão **simulados**. Não haverá pagamentos reais, compra de moedas, saque, transferência de dinheiro ou liquidação financeira entre empreendedores.

## 2. Objetivos da carteira

- Incentivar a fidelização e novas compras dentro da comunidade.
- Promover a circulação de benefícios entre empreendedores participantes.
- Dar autonomia ao vendedor para configurar seu percentual de cashback.
- Oferecer transparência sobre saldo, créditos, utilização, reservas e estornos.
- Validar segurança e regras de negócio antes de qualquer operação financeira real.

## 3. Regras de negócio aprovadas

| Código | Regra | Definição aprovada |
|---|---|---|
| RN-01 | Origem das moedas | As moedas GEMN serão obtidas como cashback de compras elegíveis. |
| RN-02 | Financiamento | O vendedor que oferece o cashback será responsável pelo benefício concedido, com contabilização simulada no MVP. |
| RN-03 | Percentual | Cada vendedor poderá configurar cashback entre **0% e 20%**, inclusive. |
| RN-04 | Autonomia do vendedor | O vendedor poderá alterar seu percentual sem aprovação prévia; o backend validará os limites. |
| RN-05 | Equivalência | **1 GEMN = R$ 1,00 em descontos** no marketplace; não representa direito a saque ou conversão em dinheiro. |
| RN-06 | Base de cálculo | O cashback incidirá **somente sobre o valor efetivamente pago em reais**, excluindo descontos concedidos em GEMN. |
| RN-07 | Uso entre vendedores | As moedas poderão ser utilizadas em qualquer vendedor participante que aceite GEMN. |
| RN-08 | Limite de utilização | As moedas poderão cobrir **até 100% do valor de uma compra**, desde que haja saldo disponível e aceitação do vendedor. |
| RN-09 | Pedido pendente | Pedidos pendentes não geram crédito de cashback. |
| RN-10 | Confirmação | **Somente um administrador GEMN autorizado** poderá confirmar pagamentos simulados no MVP. |
| RN-11 | Liberação | O cashback elegível ficará disponível **imediatamente após a confirmação simulada** do pagamento. |
| RN-12 | Validade | As moedas GEMN **não terão prazo de validade no MVP**. |
| RN-13 | Cancelamento | Cashback já utilizado será recuperado de créditos futuros, sem deixar o saldo disponível negativo. |
| RN-14 | Reservas | Moedas destinadas a pedidos pendentes deverão ser reservadas para impedir uso duplicado; a reserva será efetivada na confirmação ou liberada no cancelamento. |
| RN-15 | Controle de saldo | Somente o backend poderá efetuar créditos, reservas, débitos, estornos e ajustes, com histórico auditável. |
| RN-16 | Ambiente simulado | Nenhuma operação representará movimentação financeira real ou liquidação efetiva entre vendedores. |

### 3.1. Regras complementares

- Alterações no percentual de cashback afetarão apenas **novos pedidos**. Cada pedido preservará a regra vigente no momento de sua criação.
- Uma compra integralmente coberta por GEMN **não gera cashback**, pois o valor pago em reais é zero.
- A configuração de cashback e a aceitação de GEMN são conceitos diferentes: um vendedor pode oferecer cashback sem necessariamente aceitar GEMN em todos os anúncios.
- Os limites e as permissões deverão ser impostos no banco de dados, e não apenas na interface.

## 4. Jornada do comprador

1. O comprador acessa o marketplace e visualiza os produtos, os preços e o cashback oferecido.
2. Escolhe quanto utilizar de seu saldo GEMN, entre zero e o valor integral da compra, quando o vendedor aceitar a moeda.
3. Ao criar o pedido, o backend valida o saldo e **reserva** as moedas utilizadas; o pedido permanece **pendente**.
4. Enquanto o pedido estiver pendente, **nenhum cashback é creditado**.
5. Um **administrador GEMN autorizado** confirma o pagamento **simulado**.
6. Na confirmação, o sistema efetiva a utilização das moedas reservadas e credita imediatamente o cashback calculado sobre a parcela em reais.
7. O comprador consulta o saldo e o histórico de movimentações em sua carteira.
8. Se o pedido for cancelado, as reservas ou os créditos envolvidos serão revertidos conforme as regras de estorno.

> **Atenção:** a confirmação simulada não representa pagamento real, entrega do produto nem conclusão do serviço. A carteira e as rotinas de confirmação ainda serão implementadas.

## 5. Exemplos ilustrativos

### Exemplo A — Compra em reais com cashback

| Operação | Valor |
|---|---:|
| Compra simulada | R$ 100,00 |
| Cashback configurado pelo vendedor | 5% |
| Valor elegível em reais | R$ 100,00 |
| Cashback após confirmação simulada | **5 GEMN** |

### Exemplo B — Compra mista em outro vendedor

| Operação | Valor |
|---|---:|
| Preço do produto | R$ 100,00 |
| Desconto utilizando moedas | 20 GEMN (R$ 20,00) |
| Parcela restante em reais | R$ 80,00 |
| Cashback configurado | 5% |
| Cashback após confirmação simulada | **4 GEMN** |

### Exemplo C — Compra integralmente em GEMN

| Operação | Valor |
|---|---:|
| Preço do produto | R$ 80,00 |
| Utilização de moedas | 80 GEMN |
| Parcela restante em reais | R$ 0,00 |
| Cashback gerado | **0 GEMN** |

### Exemplo D — Cancelamento após utilização do cashback

O comprador recebeu **10 GEMN** de cashback e já utilizou **8 GEMN** em outra compra. Se o pedido original for cancelado:

- **2 GEMN** ainda disponíveis serão estornadas;
- **8 GEMN** serão registradas como valor a recuperar;
- o saldo disponível ficará em **0 GEMN**, nunca negativo;
- futuros créditos de cashback quitarão primeiro os **8 GEMN** pendentes; apenas o excedente ficará disponível.

Todos os exemplos são **simulações** e não representam movimentações financeiras reais.

## 6. Responsabilidades dos participantes

### Comprador

- Consultar saldo, reservas e histórico de movimentações.
- Receber cashback apenas após confirmação simulada autorizada.
- Utilizar GEMN somente em compras elegíveis de vendedores participantes.
- Não possuir permissão para confirmar o próprio pagamento ou alterar o saldo.

### Vendedor

- Configurar e alterar autonomamente seu cashback entre **0% e 20%**.
- Informar a aceitação de GEMN em suas ofertas, conforme as regras do marketplace.
- Consultar, futuramente, benefícios concedidos e compensações simuladas.
- Respeitar as condições preservadas nos pedidos já criados.

### Administração GEMN

- Confirmar pagamentos simulados mediante autorização e auditoria.
- Supervisionar as regras gerais, as movimentações e os cancelamentos.
- Monitorar a compensação simulada entre empreendedores.
- Avaliar as condições operacionais, financeiras e jurídicas antes de qualquer uso com dinheiro real.

## 7. Segurança e integridade — requisitos de implementação

As regras abaixo são **requisitos planejados**, ainda não entregas concluídas da carteira:

- Manter carteiras e lançamentos auditáveis no Supabase/PostgreSQL.
- Processar saldos, reservas, confirmações e estornos em **transações atômicas**.
- Aplicar bloqueios e restrições para impedir **saldo negativo**, **gasto duplo** e **cashback duplicado**.
- Utilizar **idempotência** em operações sujeitas a repetição.
- Registrar o percentual e o valor de cashback como **snapshot do pedido**, sem alteração retroativa.
- Proibir créditos de cashback em pedidos pendentes.
- Exigir autorização administrativa **no backend** para confirmar pagamentos simulados.
- Restringir a leitura e a escrita das carteiras com permissões adequadas e políticas de acesso.
- Registrar estornos e recuperações futuras sem apagar o histórico.
- Separar claramente **moedas GEMN**, **compensações simuladas entre vendedores** e **dinheiro real**.

## 8. Escopo da Sprint 2.4

| Etapa | Entrega planejada |
|---|---|
| 2.4A | Consolidação das regras e diagnóstico técnico da integração com pedidos. |
| 2.4B | Modelagem de carteiras, transações, reservas, regras de cashback e compensação simulada. |
| 2.4C | Interfaces de carteira e configuração do vendedor para Web e Android. |
| 2.4D | Confirmação administrativa, utilização de GEMN, cashback, cancelamentos e testes. |
| 2.4E | Documentação e preparação conceitual para integrações futuras, sem pagamentos reais. |

**Fora do escopo do MVP:** compra de moedas com dinheiro real, saques, transferências financeiras, pagamentos reais e liquidação financeira automática entre vendedores.

## 9. Questões técnicas e operacionais ainda pendentes

As regras principais estão aprovadas. Antes de ativar as movimentações de carteira, ainda será necessário detalhar:

1. **Compensação simulada entre vendedores:** como registrar obrigações entre quem concedeu o cashback e quem aceitou GEMN, sem criar saldo financeiro real.
2. **Cobertura do financiamento:** como contabilizar o benefício concedido pelo vendedor sem exigir depósito ou saldo financeiro real no MVP.
3. **Reserva e expiração de pedidos pendentes:** em quais situações reservas serão liberadas automaticamente e quem poderá cancelar pedidos.
4. **Estornos de compras em GEMN:** como reverter débitos e compensações quando o pedido for cancelado depois da confirmação.
5. **Arredondamento:** precisão de GEMN e regra única de arredondamento no PostgreSQL.
6. **Política de anúncios:** se a aceitação de GEMN será configurada apenas no vendedor ou também por produto/serviço.
7. **Testes e permissões:** validar concorrência, isolamento de dados, confirmações administrativas e operações repetidas.

Esses pontos são **detalhamentos de implementação**, não alterações nas regras já aprovadas.

## 10. Estado atual do projeto

As Sprints **2.2 e 2.3** entregaram a base de pedidos com Supabase local, incluindo criação e consulta de pedidos, testadas na Web e no Android.

- **Commit dos pedidos:** `29ac0d3` — `feat: implementa pedidos com Supabase nas plataformas web e mobile`.
- **Commit da primeira versão deste documento:** `bfd99fd` — `docs: documenta regras de negocio da carteira GEMN`.
- **Situação da carteira:** regras aprovadas e diagnóstico técnico realizado; **carteira, cashback e reservas ainda não implementados**.
- **Supabase remoto:** as migrations de pedidos ainda dependem de publicação e validação próprias; a documentação no GitHub não altera o banco remoto.

---

## Resumo para apresentação

O GEMN criará uma **rede de benefícios entre empreendedores**. Cada vendedor poderá oferecer até **20% de cashback**, definido por ele mesmo. O comprador acumulará moedas GEMN e poderá utilizá-las em estabelecimentos participantes, inclusive para cobrir **100% de uma compra**. Cada moeda corresponderá a **R$ 1,00 em descontos**, sem possibilidade de saque. O cashback incidirá apenas sobre a parcela paga em reais e ficará disponível após confirmação simulada autorizada. As moedas não vencerão no MVP.

**A primeira implementação será inteiramente simulada**, permitindo validar a experiência, a segurança e a compensação entre vendedores antes de qualquer operação financeira real.
