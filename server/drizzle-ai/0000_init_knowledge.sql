CREATE TABLE "knowledge_documents" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"revision" text NOT NULL,
	"title" text NOT NULL,
	"mime_type" text,
	"category" text,
	"uri" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"document_id" char(24) NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_documents_source_ref_uq" ON "knowledge_documents" USING btree ("source","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_doc_idx_uq" ON "knowledge_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_doc_idx" ON "knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_hnsw" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
