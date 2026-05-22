ALTER TABLE "devices" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "agent_type" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "agent_role" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "capabilities" text[] DEFAULT ARRAY[]::text[] NOT NULL;