-- Supabase exposes the public schema through its Data API. The app talks to
-- Postgres directly from the server, so every table gets RLS enabled with no
-- policies: anon/authenticated API keys can read or write nothing (SEGURANCA.md #4).
ALTER TABLE "editions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goal_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- First edition. Registration stays closed until approved in production.
INSERT INTO "editions" ("slug", "name", "city", "time_zone", "registration_open")
VALUES ('belem-2026', 'Edição Belém', 'Belém', 'America/Belem', false)
ON CONFLICT ("slug") DO NOTHING;
