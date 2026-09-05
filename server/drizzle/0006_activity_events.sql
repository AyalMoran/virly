CREATE TABLE "activity_events" (
  "id" char(24) PRIMARY KEY NOT NULL,
  "user_id" char(24) NOT NULL,
  "kind" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "ip" text,
  "geo" jsonb,
  "transaction_id" char(24),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "activity_events_kind_check" CHECK ("kind" IN ('login', 'transfer'))
);
--> statement-breakpoint
CREATE INDEX "activity_events_user_at_idx" ON "activity_events" ("user_id", "at");
--> statement-breakpoint
CREATE INDEX "activity_events_expires_at_idx" ON "activity_events" ("expires_at");
