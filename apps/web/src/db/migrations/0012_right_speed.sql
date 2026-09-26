CREATE TABLE IF NOT EXISTS "project_jev_policy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"source" text NOT NULL,
	"old_enabled" boolean NOT NULL,
	"new_enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_jev_policy_events_actor_source_check" CHECK (("project_jev_policy_events"."source" = 'web' AND "project_jev_policy_events"."actor_user_id" IS NOT NULL) OR ("project_jev_policy_events"."source" = 'ops' AND "project_jev_policy_events"."actor_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "jev_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_jev_policy_events" ADD CONSTRAINT "project_jev_policy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_jev_policy_events" ADD CONSTRAINT "project_jev_policy_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_jev_policy_events_project_created_idx" ON "project_jev_policy_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_item_events_actor_type_created_idx" ON "work_item_events" USING btree ("actor_user_id","event_type","created_at");