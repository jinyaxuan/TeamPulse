ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_owner_id" uuid;
--> statement-breakpoint
WITH first_admin AS (
  SELECT "id"
  FROM "users"
  WHERE "role" = 'admin'
    AND "revoked_at" IS NULL
  ORDER BY "created_at" ASC
  LIMIT 1
)
UPDATE "users"
SET "team_owner_id" = CASE
  WHEN "role" = 'admin' THEN "id"
  ELSE COALESCE((SELECT "id" FROM first_admin), "id")
END
WHERE "team_owner_id" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_team_owner_id_users_id_fk" FOREIGN KEY ("team_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_team_owner_idx" ON "users" USING btree ("team_owner_id");
