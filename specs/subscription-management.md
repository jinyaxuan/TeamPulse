# 订阅管理完善 (Subscription Management)

## JTBD
Let users fully manage their subscription: cancel, change months, see renewal info.

## Requirements

1. Cancel subscription button on /settings/billing with confirmation dialog
2. Month selector (1/3/6/12 months) on upgrade, with discount display:
   - 1 month: ¥49
   - 3 months: ¥139 (省5%)
   - 6 months: ¥269 (省8%)
   - 12 months: ¥499 (省15%)
3. Show days remaining prominently
4. Show renewal reminder when <7 days remaining
5. POST /api/v1/billing/cancel endpoint

## Acceptance Criteria

- [ ] Users can cancel subscription with confirmation
- [ ] Month selector shows pricing with discounts
- [ ] Days remaining shown on billing page
- [ ] Renewal warning when <7 days left
- [ ] Cancelled subscription status shown correctly
