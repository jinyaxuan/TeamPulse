# TeamPulse 商业化功能 — Implementation Plan

## Completed

### ✅ Phase A: 计费系统 (7 commits)
1. [DONE] 数据库 Schema (plans/subscriptions/orders) + 种子脚本
2. [DONE] 公开落地页 /pricing (Hero + 功能展示 + 3列定价表)
3. [DONE] 虎皮椒支付 API (create-order/notify/return/status)
4. [DONE] 订阅管理 UI (/settings/billing)
5. [DONE] 功能限制 (成员/项目/设备上限 + 活动导出付费墙)
6. [DONE] 管理员计费仪表盘 (/admin/billing)
7. [DONE] Docker 部署配置 (虎皮椒环境变量)

### ✅ Phase B: 功能补全 (7 commits)
1. [DONE] 自助注册 — 开放注册模式 (REGISTRATION_MODE=open)
2. [DONE] 错误页面 — 404 和错误边界
3. [DONE] 速率限制 — login/register/device/billing 端点
4. [DONE] 用量预警 — Dashboard 显示套餐用量进度条
5. [DONE] 订阅管理完善 — 取消、多月折扣、续费提醒
6. [DONE] 帮助文档 — /help FAQ 页面 (10 个问题)
7. [DONE] 新用户引导 — Dashboard 三步引导清单

## Pending (Next Priorities)

### 8. [PENDING] 落地页 SEO + Open Graph 标签
- Add proper meta tags, og:image, description to pricing and help pages
- Add robots.txt and sitemap.xml

### 9. [PENDING] 邮件通知系统
- Welcome email on registration
- Payment confirmation email
- Subscription expiry warning

### 10. [PENDING] 数据导出/删除
- GET /api/v1/users/me/export — export all user data as JSON
- DELETE /api/v1/users/me — soft delete account

### 11. [PENDING] Webhook 集成
- Admin can configure webhook URLs
- Events: task.started, task.ended, overlap.detected

### 12. [PENDING] 团队分析仪表盘
- /analytics page with productivity metrics
- Task completion rate, average duration, overlap frequency
