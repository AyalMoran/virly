CREATE TABLE "verification_tokens" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_user_id_uq" ON "verification_tokens" USING btree ("user_id");