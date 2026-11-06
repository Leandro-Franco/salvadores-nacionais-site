# 0005 — Limite e "não sou um robô" no checkout

Data: 2026-11-06 · Pedido do organizador durante o teste de pagamento.

- Limite do checkout: **1 tentativa a cada 15 segundos** por cliente (HMAC do IP, contador no Postgres). Antes era
  5 a cada 10 min e contava até envios com campo faltando; agora só envios válidos gastam a tentativa.
- Caixa "não sou um robô": **Google reCAPTCHA v2** (caixa de seleção), escolhido pelo organizador. Verificada no
  servidor (`siteverify`) com `RECAPTCHA_SECRET_KEY`; a chave pública vai em `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
  Sem dependência npm: o script vem de `www.google.com`/`www.gstatic.com`, liberados na CSP (`script-src`,
  `frame-src` com `www.google.com` e `recaptcha.google.com`).
- Falha de rede ou resposta inválida do Google bloqueia a tentativa (falha fechada).
- A política de privacidade precisa citar o Google como terceiro que recebe dados do navegador no checkout.
- Enquanto as chaves não existem, a verificação é pulada. Antes de vender de verdade, as chaves passam a ser
  obrigatórias (`docs/open-questions.md`). Webhook e cron nunca passam pela caixa (security-requirements §5).
