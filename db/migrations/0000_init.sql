CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"time_zone" text DEFAULT 'America/Belem' NOT NULL,
	"registration_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"kits_target" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "goal_milestones_target_positive" CHECK ("goal_milestones"."kits_target" > 0)
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"stock_total" integer NOT NULL,
	"stock_reserved" integer DEFAULT 0 NOT NULL,
	"stock_sold" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "kits_price_positive" CHECK ("kits"."price_cents" > 0),
	CONSTRAINT "kits_stock_consistent" CHECK ("kits"."stock_reserved" >= 0 and "kits"."stock_sold" >= 0 and "kits"."stock_reserved" + "kits"."stock_sold" <= "kits"."stock_total")
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anonymized_at" timestamp with time zone,
	CONSTRAINT "registrations_name_len" CHECK (char_length("registrations"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_milestones_edition_target_uq" ON "goal_milestones" USING btree ("edition_id","kits_target");--> statement-breakpoint
CREATE UNIQUE INDEX "kits_edition_sku_uq" ON "kits" USING btree ("edition_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_edition_email_hash_uq" ON "registrations" USING btree ("edition_id","email_hash");