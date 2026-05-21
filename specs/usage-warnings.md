# 用量预警 (Usage Warnings)

## JTBD
Warn users before they hit plan limits, so they upgrade proactively instead of being blocked.

## Requirements

1. Show usage indicators on relevant pages:
   - Dashboard: "团队成员 2/2" with progress bar
   - Projects list: "项目 2/3" indicator
   - Settings/connect: "设备 1/1" indicator
2. When at 80%+ capacity, show amber warning
3. When at 100%, show upgrade prompt inline
4. Usage data comes from existing plan-limits.ts checks
5. Reuse the UpgradePrompt component for 100% state

## Acceptance Criteria

- [ ] Dashboard shows member/project/device usage summary
- [ ] Amber warning at 80%+ usage
- [ ] Upgrade prompt at 100% usage
- [ ] Numbers are accurate and real-time
