CREATE TABLE "ai_audit_logs" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"conversation_id" text NOT NULL,
	"request_id" text,
	"assistant_id" text DEFAULT 'oshri' NOT NULL,
	"intent" text NOT NULL,
	"tools_requested" text[] DEFAULT '{}'::text[] NOT NULL,
	"tools_executed" text[] DEFAULT '{}'::text[] NOT NULL,
	"refusal_reason" text,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"conversation_id" text NOT NULL,
	"assistant_id" text DEFAULT 'oshri' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_pending_transfers" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"conversation_id" text NOT NULL,
	"assistant_id" text DEFAULT 'oshri' NOT NULL,
	"recipient_email" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'ILS' NOT NULL,
	"recipient_first_name" text,
	"recipient_last_name" text,
	"amount" double precision NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"superseded_by_id" char(24),
	"supersedes_id" char(24),
	"idempotency_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_pending_status_ck" CHECK ("ai_pending_transfers"."status" in ('pending','confirmed','denied','expired','superseded')),
	CONSTRAINT "ai_pending_currency_ck" CHECK ("ai_pending_transfers"."currency" = 'ILS')
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"rates" jsonb NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"valid_for_date" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source_response_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_details" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"status" text DEFAULT 'not_provided' NOT NULL,
	"first_name" text,
	"last_name" text,
	"date_of_birth" timestamp with time zone,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_skipped_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "personal_details_status_ck" CHECK ("personal_details"."status" in ('not_provided','provided'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"owner_id" char(24) NOT NULL,
	"counterparty_email" text NOT NULL,
	"amount" double precision NOT NULL,
	"type" text NOT NULL,
	"direction_label" text NOT NULL,
	"reason" text,
	"entered_currency" text,
	"entered_amount" double precision,
	"exchange_rate_used" double precision,
	"exchange_rate_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transactions_type_ck" CHECK ("transactions"."type" in ('credit','debit'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"personal_details" char(24),
	"verification_token_hash" text,
	"verification_token_expires_at" timestamp with time zone,
	"balance" double precision NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_role_ck" CHECK ("users"."role" in ('user','support_agent','sales_agent','support_manager','admin'))
);
--> statement-breakpoint
CREATE TABLE "video_audit_logs" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"actor_id" char(24) NOT NULL,
	"actor_role" text NOT NULL,
	"target_user_id" char(24) NOT NULL,
	"video_session_id" char(24) NOT NULL,
	"session_type" text NOT NULL,
	"result" text DEFAULT 'success' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "video_audit_result_ck" CHECK ("video_audit_logs"."result" in ('success','failure'))
);
--> statement-breakpoint
CREATE TABLE "video_sessions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" char(24) NOT NULL,
	"assigned_agent_id" char(24),
	"type" text NOT NULL,
	"status" text DEFAULT 'waiting_for_agent' NOT NULL,
	"room_name" text NOT NULL,
	"provider" text NOT NULL,
	"topic" text,
	"user_problem_summary" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"user_joined_at" timestamp with time zone,
	"agent_joined_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "video_sessions_type_ck" CHECK ("video_sessions"."type" in ('support','sales')),
	CONSTRAINT "video_sessions_status_ck" CHECK ("video_sessions"."status" in ('requested','waiting_for_agent','active','ended','missed','cancelled','failed'))
);
--> statement-breakpoint
CREATE INDEX "ai_audit_user_idx" ON "ai_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_audit_conv_idx" ON "ai_audit_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_audit_request_idx" ON "ai_audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_conversations_user_conv_uq" ON "ai_conversations" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "ai_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_expires_idx" ON "ai_conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_pending_user_idx" ON "ai_pending_transfers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_pending_conv_idx" ON "ai_pending_transfers" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_pending_status_idx" ON "ai_pending_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_pending_expires_idx" ON "ai_pending_transfers" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_base_date_uq" ON "exchange_rates" USING btree ("base_currency","valid_for_date");--> statement-breakpoint
CREATE INDEX "exchange_rates_base_fetched_idx" ON "exchange_rates" USING btree ("base_currency","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_details_user_uq" ON "personal_details" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_details_name_idx" ON "personal_details" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "transactions_owner_idx" ON "transactions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transactions_owner_cp_created_idx" ON "transactions" USING btree ("owner_id","counterparty_email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "video_audit_event_idx" ON "video_audit_logs" USING btree ("event");--> statement-breakpoint
CREATE INDEX "video_audit_actor_idx" ON "video_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "video_audit_target_idx" ON "video_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "video_audit_session_idx" ON "video_audit_logs" USING btree ("video_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_sessions_room_uq" ON "video_sessions" USING btree ("room_name");--> statement-breakpoint
CREATE INDEX "video_sessions_user_idx" ON "video_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_sessions_agent_idx" ON "video_sessions" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "video_sessions_type_idx" ON "video_sessions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "video_sessions_status_idx" ON "video_sessions" USING btree ("status");