CREATE TABLE "communication_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"formality" jsonb,
	"verbosity" jsonb,
	"complexity" jsonb,
	"humor" jsonb,
	"pace" jsonb,
	"memory" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_profiles_user_id_unique" UNIQUE("user_id")
);
