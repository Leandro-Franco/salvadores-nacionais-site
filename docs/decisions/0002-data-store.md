# 0002 — Inscrições e rate limit no Postgres

Data: 2026-11-02

- `DATA_STORE=memory` (só local) ou `postgres`. Fora de `APP_ENV=local`, `memory` é recusado na validação do ambiente.
- Deduplicação por `(edition_id, email_hash)` com `ON CONFLICT DO NOTHING`; `email_hash` é HMAC-SHA256 do e-mail
  normalizado com `IDENTITY_HMAC_KEY`. Respostas iguais para inscrição nova e repetida (RF-05).
- `editions.registration_open` no banco é a chave que libera coleta de dados reais; o conteúdo em
  `src/content/edition.ts` só controla se o formulário aparece.
- Rate limit: janela fixa em `rate_limit_buckets`, um upsert atômico por requisição, chave = HMAC do IP com
  `RATE_LIMIT_HMAC_KEY`. Se o banco falhar, a inscrição responde "indisponível" (falha fechada).
- Supabase: RLS sem policies em todas as tabelas; o acesso é só pelo servidor via conexão direta/pooler.
  O papel dono das tabelas (`postgres`) não é afetado pelo RLS; papéis da Data API ficam bloqueados.
- O e-mail fica em texto no banco porque será usado para avisos; criptografia em nível de coluna
  (SEGURANCA.md #5) será avaliada com o responsável LGPD, além da criptografia em repouso do Supabase.
