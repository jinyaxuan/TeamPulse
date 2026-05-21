# 自助注册 (Self-Service Signup)

## JTBD
Allow strangers to create accounts without invite codes, so TeamPulse can acquire paying customers organically.

## Requirements

1. Add a "开放注册" mode: when enabled, users can register with email + password directly (no invite code)
2. Keep invite code as an optional fast-track (skip email verification)
3. New env var `REGISTRATION_MODE=open|invite_only` (default: `open`)
4. Registration form: username, email, password, display name
5. New users default to `role: "member"` and auto-assigned to free plan
6. After registration, auto-login and redirect to onboarding or dashboard

## Acceptance Criteria

- [ ] /register page works without invite code when REGISTRATION_MODE=open
- [ ] Invite code field is optional (shown but not required)
- [ ] Username uniqueness validated before submit
- [ ] Password minimum 8 chars enforced client-side
- [ ] Duplicate email rejected with clear error message
- [ ] env.ts has REGISTRATION_MODE getter
- [ ] Existing invite-code flow still works
