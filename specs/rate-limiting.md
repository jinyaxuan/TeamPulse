# 速率限制 (Rate Limiting)

## JTBD
Protect API from abuse and brute-force attacks, which is essential for a public-facing paid product.

## Requirements

1. In-memory rate limiter (no Redis dependency) using a simple sliding window
2. Create `apps/web/src/lib/rate-limit.ts` with:
   - `rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean, remaining: number }`
3. Apply to sensitive endpoints:
   - POST /api/v1/auth/login: 10 attempts per 15 min per IP
   - POST /api/v1/auth/register: 5 per hour per IP
   - POST /api/v1/devices/register: 20 per hour per IP
   - POST /api/v1/billing/create-order: 10 per hour per user
4. Return 429 Too Many Requests with Retry-After header
5. Clean up expired entries periodically (setInterval)

## Acceptance Criteria

- [ ] rate-limit.ts module works with in-memory Map
- [ ] Login endpoint returns 429 after 10 failures
- [ ] Registration endpoint returns 429 after 5 attempts
- [ ] Response includes Retry-After header
- [ ] Memory cleanup runs every 5 minutes
