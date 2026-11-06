CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"kit_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"print" text NOT NULL,
	"size" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"total_cents" integer NOT NULL,
	"financial_status" text DEFAULT 'unpaid' NOT NULL,
	"reservation_status" text DEFAULT 'held' NOT NULL,
	"provider" text NOT NULL,
	"creation_state" text DEFAULT 'pending' NOT NULL,
	"provider_order_id" text,
	"checkout_url" text,
	"remote_status" text,
	"remote_status_detail" text,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"review_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total_cents" > 0),
	CONSTRAINT "orders_buyer_name_len" CHECK (char_length("orders"."buyer_name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"topic" text NOT NULL,
	"order_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payment_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"remote_status" text NOT NULL,
	"remote_status_detail" text,
	"paid_cents" integer NOT NULL,
	"refunded_cents" integer NOT NULL,
	"financial_status" text NOT NULL,
	"reservation_status" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "visitor_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"topic" text NOT NULL,
	"resource_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_evidence" ADD CONSTRAINT "payment_evidence_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_held_per_session_uq" ON "orders" USING btree ("session_id") WHERE "orders"."reservation_status" = 'held';--> statement-breakpoint
CREATE INDEX "orders_held_expiry_idx" ON "orders" USING btree ("expires_at") WHERE "orders"."reservation_status" = 'held';--> statement-breakpoint
CREATE INDEX "outbox_unsent_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."sent_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_resource_uq" ON "webhook_inbox" USING btree ("provider","topic","resource_id");--> statement-breakpoint
CREATE INDEX "webhook_inbox_pending_idx" ON "webhook_inbox" USING btree ("next_attempt_at") WHERE "webhook_inbox"."processed_at" is null;--> statement-breakpoint
-- Same rule as 0002: no Data API access to these tables (SEGURANCA.md #4).
ALTER TABLE "visitor_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_leases" ENABLE ROW LEVEL SECURITY;
