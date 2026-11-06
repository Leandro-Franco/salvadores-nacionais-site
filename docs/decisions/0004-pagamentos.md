# 0004 — Pagamento do kit: Mercado Pago Checkout Pro via Orders

Data: 2026-11-03 · Status: **aceita** para implementação; **homologação pendente** (sandbox da conta recebedora)

Requisitos aplicados: `docs/security-requirements.md` (do organizador, 03/11/2026) e spec §9–10.

## Decisão

- Gateway: **Mercado Pago** (confirmado pelo organizador em 03/11/2026).
- Produto: **Checkout Pro com redirecionamento**, família de API **Orders** (`/v1/orders`), como a spec §9.1 pede
  avaliar primeiro. A primeira versão deste PR usava Preferences; foi trocada antes do merge. Nenhum payload, id,
  assinatura ou estado de Preferences/Payments é usado.
- Sem SDK: três chamadas (`POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/cancel`) com `fetch`
  em host fixo. Nenhuma dependência nova.
- A assinatura do webhook segue o validador do SDK oficial (`sdk-nodejs/src/utils/webhook`):
  `id:{data.id};request-id:{x-request-id};ts:{ts};`, HMAC-SHA256, partes ausentes omitidas. Documentação antiga
  manda o id em minúsculas e o SDK não; aceitamos as duas formas. Sem janela de tempo, porque reentregas legítimas
  reutilizam valores antigos e o processamento é idempotente.

## Fluxo

1. Server action `checkout`: `SALES_ENABLED` validado no servidor, rate limit compartilhado, Zod; preço, kit e
   vendedor vêm só do servidor.
2. Sessão de visitante: token opaco de 256 bits em cookie `__Host-sn_session` (`Secure`, `HttpOnly`, `Path=/`,
   `SameSite=Lax`); o banco guarda só o SHA-256, com expiração e revogação.
3. Um pedido aberto por sessão (índice único parcial). Clique duplo e outra aba retomam o mesmo pedido; outra
   escolha recebe "pedido em aberto" com opção de continuar ou cancelar.
4. A reserva (`UPDATE` condicional) e o pedido são gravados antes da chamada de rede; nenhuma transação fica aberta
   durante a chamada.
5. `POST /v1/orders` com `X-Idempotency-Key` = id do pedido. `checkout_url` só é aceita em https e nos hosts
   exatos do Mercado Pago. Timeout/5xx/409/429 viram `creation_state=unknown`: a próxima tentativa (do comprador
   ou da conciliação) repete a mesma chave, nunca cria outra cobrança. 4xx definitivo libera a unidade.
6. Webhook `POST /api/webhooks/payments`: valida assinatura, grava em `webhook_inbox` e só então responde 200.
   O processamento consulta `GET /v1/orders/{id}` e confere referência, vendedor (`user_id`), aplicação, moeda e
   valor. Divergência vira `requires_review`, sem liberar estoque.
7. Estados separados: financeiro (`unpaid … requires_review`) e reserva (`held | committed | released | exception`).
   Estado financeiro, estoque, evidência (`payment_evidence`) e `outbox` mudam na mesma transação.
8. Reserva só é liberada com o pedido remoto verificado como encerrado: a conciliação cancela o order expirado,
   relê e só então libera. Pagamento em análise após o prazo mantém a reserva e pede revisão. Pagamento tardio
   recompõe estoque se houver unidade; senão vira `exception` + revisão.
9. Conciliação `GET /api/cron/reconcile` (Bearer `CRON_SECRET`, comparação em tempo constante), com lease no
   banco, lotes pequenos e backoff finito: reprocessa a inbox, recupera criações desconhecidas, expira reservas e
   limpa `rate_limit_buckets`.
10. Retorno `/kit/obrigado` não confirma nada. Pausar vendas (`SALES_ENABLED=false`) mantém webhook e conciliação.

Pedidos exigem Postgres; com `DATA_STORE=memory` o checkout responde "indisponível". `PAYMENTS_MODE=mock` usa um
provedor em memória (testes e demonstração local com Postgres local).

## Sandbox (a confirmar na conta)

As páginas de referência de Orders dizem: "Não há suporte para credenciais de teste. Utilize usuários de teste com
credenciais de produção". Portanto o sandbox deve usar **um usuário de teste vendedor** e o token de produção dele.
Validar também: `not_allowed_types` (`ticket`, `atm`), `expiration_time` (`PT30M`), retorno com `auto_return`, o
tópico do webhook ("Order") e se o estado final de reembolso é `refunded` no nível do order.

## Plano da Vercel

As regras de uso justo limitam o Hobby a uso pessoal e não comercial. Contam como comercial "qualquer forma de
pedir ou processar pagamento dos visitantes" e "anunciar a venda de um produto"; pedir doação não conta. Vender o
kit exige **Pro**. Também por isso o cron não está em `vercel.json`: o Hobby só aceita execução diária, e a spec
§10.3 propõe a cada 5 minutos. Ao assinar o Pro, adicionar `crons: [{ path: "/api/cron/reconcile", schedule:
"*/5 * * * *" }]`.

## Falta antes de vender

- Conta recebedora definida (a spec §9.6 fala em vendedor PJ) e homologação no sandbox, com evidências.
- Variáveis: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_USER_ID`,
  `MERCADOPAGO_APPLICATION_ID`, `CRON_SECRET`, `APP_ENV` ≠ `local` na Vercel.
- Vercel Pro, cron a cada 5 min, regras de WAF para as rotas e teste do webhook sob regras de bot/Attack Mode.
- Prazo de reserva aprovado (30 min é demonstração) e cadastro do kit no banco.
- Consumidor da outbox (e-mail via SES), tela de pedido e recuperação por e-mail com token de uso único, painel
  admin com MFA, alertas de revisão.
- Frete, termos de compra, matriz ASVS 5.0 L2 com IDs oficiais e os itens de `SEGURANCA.md`.
