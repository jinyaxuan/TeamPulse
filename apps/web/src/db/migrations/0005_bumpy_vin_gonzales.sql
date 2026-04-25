CREATE TABLE IF NOT EXISTS "task_overlap_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"first_task_id" uuid NOT NULL,
	"second_task_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_overlap_resolutions" ADD CONSTRAINT "task_overlap_resolutions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_overlap_resolutions" ADD CONSTRAINT "task_overlap_resolutions_first_task_id_tasks_id_fk" FOREIGN KEY ("first_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_overlap_resolutions" ADD CONSTRAINT "task_overlap_resolutions_second_task_id_tasks_id_fk" FOREIGN KEY ("second_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_overlap_resolutions" ADD CONSTRAINT "task_overlap_resolutions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_overlap_resolutions_pair_unique" ON "task_overlap_resolutions" USING btree ("project_id","first_task_id","second_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_overlap_resolutions_project_updated_idx" ON "task_overlap_resolutions" USING btree ("project_id","updated_at");