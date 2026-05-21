# 新用户引导 (Onboarding Flow)

## JTBD
Guide new users through setup so they understand how to connect their AI agent and start using TeamPulse.

## Requirements

1. After first login, show a setup checklist overlay/banner on dashboard
2. Steps:
   - Step 1: 完善个人资料 (set display name) — link to /settings/profile
   - Step 2: 接入 Agent (connect a device) — link to /settings/connect
   - Step 3: 开始第一个任务 (start using) — link to docs/help
3. Checklist persists until all steps completed (track via user metadata or simple flag)
4. Dismissible but re-accessible from settings
5. Show progress: "2/3 步骤已完成"

## Acceptance Criteria

- [ ] New users see onboarding checklist on dashboard
- [ ] Each step links to the correct page
- [ ] Completed steps show checkmark
- [ ] Checklist disappears after all steps done
- [ ] Can be dismissed manually
