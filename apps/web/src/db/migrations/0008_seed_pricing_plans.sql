INSERT INTO "plans" (
  "slug",
  "name",
  "description",
  "price_monthly",
  "max_members",
  "max_projects",
  "max_devices_per_user",
  "features_json",
  "is_active",
  "sort_order"
) VALUES
  (
    'free',
    '免费版',
    '适合个人开发者体验',
    0,
    2,
    3,
    1,
    '["task_tracking","presence","memory_sync"]',
    1,
    0
  ),
  (
    'pro',
    '专业版',
    '适合小型开发团队',
    4900,
    10,
    999999,
    3,
    '["task_tracking","presence","memory_sync","overlap_detection","message_threads","activity_export","priority_support"]',
    1,
    1
  ),
  (
    'enterprise',
    '企业版',
    '适合大型团队和企业',
    0,
    999999,
    999999,
    999999,
    '["task_tracking","presence","memory_sync","overlap_detection","message_threads","activity_export","priority_support","self_hosted","custom_oidc","dedicated_support"]',
    1,
    2
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "price_monthly" = EXCLUDED."price_monthly",
  "max_members" = EXCLUDED."max_members",
  "max_projects" = EXCLUDED."max_projects",
  "max_devices_per_user" = EXCLUDED."max_devices_per_user",
  "features_json" = EXCLUDED."features_json",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order";
