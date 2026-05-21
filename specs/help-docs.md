# 帮助文档 (Help & Documentation)

## JTBD
Provide users with self-service documentation to reduce support burden and improve onboarding.

## Requirements

1. Create /help page with FAQ-style expandable sections
2. Sections:
   - 什么是 TeamPulse?
   - 如何接入 Claude Code?
   - 如何接入 Codex?
   - 如何接入通用 Agent?
   - 任务追踪如何工作?
   - 记忆同步如何工作?
   - 冲突检测如何工作?
   - 如何升级套餐?
   - 常见问题
3. No external dependencies — pure server component with Tailwind accordion
4. Link from footer, AppShell, and pricing page

## Acceptance Criteria

- [ ] /help page renders with all sections
- [ ] Sections are expandable/collapsible
- [ ] Links from AppShell navigation and pricing footer
- [ ] Content is accurate and matches current functionality
