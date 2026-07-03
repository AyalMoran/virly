CREATE TABLE "contacts" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"owner_id" char(24) NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_owner_email_uq" ON "contacts" USING btree ("owner_id","email");
--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");
