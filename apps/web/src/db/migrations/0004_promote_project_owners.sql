WITH first_members AS (
	SELECT DISTINCT ON ("project_id")
		"project_id",
		"user_id"
	FROM "project_members"
	ORDER BY "project_id", "created_at" ASC, "last_seen_at" ASC
)
UPDATE "project_members"
SET "role" = 'owner'
FROM first_members
WHERE "project_members"."project_id" = first_members."project_id"
	AND "project_members"."user_id" = first_members."user_id"
	AND NOT EXISTS (
		SELECT 1
		FROM "project_members" existing_owner
		WHERE existing_owner."project_id" = first_members."project_id"
			AND existing_owner."role" = 'owner'
	);
