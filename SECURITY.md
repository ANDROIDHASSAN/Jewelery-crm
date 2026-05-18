# Security model — Gold OS

Last reviewed: 2026-05-19. Owner: Anantkamal Software Labs.

Read this before changing anything in `server/src/middleware/`, `server/src/lib/prisma.ts`, or `server/src/modules/auth/`. Anything that protects multi-tenant data isolation, authentication, or rate-limiting needs a second-pair sign-off.

---

## Threat model — who we defend against

| Actor | Threat | Defence |
|---|---|---|
| Anonymous web visitor | Hits public storefront, tries to reach admin endpoints. | All `/api/v1/*` except `/auth`, `/website`, `/health` require a valid JWT bearer. CORS allowlist limits origins. |
| Curious staff member of one tenant | Tries to read another tenant's customers, bills, sales. | Tenant isolation via Prisma extension (see `server/src/lib/prisma.ts`) injects `tenantId` into every read/write. `findUnique` is special-cased: we run it then check `result.tenantId` post-hoc. Tested in `rbac.test.ts`. |
| Cashier (role `BILLING`) | Tries to refund, void, edit prices, change inventory. | Per-route `requirePermission(...)` gates from the Permission catalog. Cashier has `pos.access` + a narrow write set, not `inventory.delete` / `finance.expense_write` / `users.write` etc. |
| Ex-employee whose account was disabled | Tries to log in with old credentials or replays an old JWT. | Disabling sets `user.disabled=true`; login service refuses. JWT access tokens are short-lived; refresh tokens are server-side rotatable via `revokeToken` on disable. |
| Someone who reads the GitHub repo | Hopes to find a hardcoded secret. | All secrets live in environment variables, validated by `server/src/env.ts` at boot. `.env` files are gitignored. No production secret is committed. The legacy `ADMIN_API_TOKEN=admin-session-token` is hard-blocked in production by the middleware itself (see "Sentinel bypass" below). |
| Attacker with XSS foothold | Tries to exfiltrate refresh token or perform actions via the user's cookies. | Refresh cookie is `httpOnly`, `secure`, `sameSite=strict`, scoped to `/api/v1/auth`. CSP forbids inline scripts and third-party origins. CSRF protection is implicit: the access token lives in JS memory, not a cookie, so the cookie-only CSRF surface is the refresh endpoint which `sameSite=strict` shuts. |
| Brute-force credential attacker | POSTs `/auth/login` with a dictionary. | `authRateLimit` middleware = 10 req/min per IP. Argon2id hashing is intentionally expensive (~50ms/attempt). Login response uses constant-time verification of a dummy hash on user-not-found so timing can't enumerate users. |
| Network observer | Sniffs the wire for tokens or payloads. | HSTS pinning over HTTPS (1 year + includeSubDomains). All cookies marked `secure` in prod. Vercel + Render terminate TLS; the Render plan is HTTPS-only. |
| Operator who misconfigures prod | Leaves `ADMIN_API_TOKEN` set in production env. | Hard-blocked in `middleware/auth.ts`: the bypass is unreachable when `NODE_ENV=production`. Boot warning logs that the env var is set so the operator removes it. |

---

## Authentication

- **Email + password**, argon2id hashing (`server/src/modules/auth/password.ts`).
- **TOTP 2FA**, optional per user, with backup codes (`server/src/modules/auth/totp.ts`).
- **JWT access tokens**, signed HS256 with `JWT_ACCESS_SECRET`. Short-lived.
- **Refresh tokens** in `HttpOnly + Secure + SameSite=strict` cookies, scoped to `/api/v1/auth`. Rotation on refresh.
- **`mustChangePassword`** forced on first login after admin creates a user.
- **No phone OTP** for admin — legacy `/auth/otp/*` endpoints retained for storefront use only.

### What does NOT exist yet (P1 follow-up)

- Staff invitation email flow (admin creates user → email with set-password link). Today admin must share a temporary password.
- Per-device session list / force-logout view.
- WebAuthn / passkey login.
- IP allowlist per role (e.g. cashier accounts only from shop IPs).

---

## Authorisation (RBAC)

- `Permission` catalog seeded from `shared/constants.ts:PERMISSION_KEYS`. Auto-syncs on boot via `syncPermissionCatalog`.
- `Role` rows per tenant, each holding a set of `RolePermission` grants. Built-in roles: `SUPER_ADMIN`, `OWNER`, `MANAGER`, `BILLING`.
- Per-user overrides via `UserPermission` (additive or negative).
- Route protection via `requirePermission` / `requireAnyPermission` middleware (`server/src/middleware/require-permission.js`).
- Action gates inside route handlers for finer checks (e.g. refund requires `pos.refund`, not just `pos.access`).
- `SUPER_ADMIN` is intentionally fully privileged. Reserve for one human per tenant.

---

## Tenant isolation

The single critical primitive is `server/src/lib/prisma.ts`:

- A list of `TENANT_SCOPED_MODELS` (every table with a `tenantId` column).
- A Prisma extension intercepts `$allOperations` and:
  - **Read operations** (`findFirst`/`findMany`/`count`/`aggregate`/`groupBy`/`findFirstOrThrow`): inject `tenantId` into `where`.
  - **`findUnique` / `findUniqueOrThrow`**: do NOT inject (Prisma rejects extra fields in unique-only `where`). Instead, run the query and validate `result.tenantId === tenantId` after the fact. Returns `null` (or throws for `*OrThrow`) on mismatch.
  - **Write operations** (`create`/`createMany`/`update`/`updateMany`/`upsert`/`delete`/`deleteMany`): inject `tenantId` into `data` and/or `where`. `create` refuses if caller-supplied `tenantId` differs from ALS — defence against payload tampering.
- `rawPrisma` (no extension) is reserved for: super-admin endpoints, the tenant-scope middleware itself, the public website routes (which set `tenantId` manually after resolving from the canonical resolver).
- `$queryRaw` BYPASSES the extension. Any raw SQL MUST include `WHERE tenant_id = $1` explicitly.

The canonical tenant resolver (`server/src/lib/canonical-tenant.ts`) ensures the storefront, admin sentinel, and any other anonymous-context lookups all resolve to the same tenant. Prevents tenant-split bugs where a storefront reservation lands in tenant A while the admin reads tenant B.

---

## Rate limiting

- `apiRateLimit`: 100 req/min per authenticated user, 30 req/min per IP unauth.
- `authRateLimit`: 10 req/min per IP on `/auth/login`, `/auth/otp/*`. Burst-shielded.

`trust proxy=1` is set in production so the limiter sees the real client IP via `X-Forwarded-For` from Render's load balancer (not the LB's IP).

---

## Headers we set on every response

See `server/src/middleware/security-headers.ts`. Tested in `security.test.ts`.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'`, no inline `script-src`, image allowlist for Unsplash + self, `frame-ancestors 'none'` | Blocks XSS and clickjacking. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (HTTPS only) | Forces HTTPS for a year. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME confusion. |
| `X-Frame-Options` | `DENY` | Belt-and-braces clickjacking. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak full URLs to third parties. |
| `Permissions-Policy` | Aggressively deny camera/mic/geo/USB/etc. | Reduce attack surface if XSS lands. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Spectre/cross-origin read mitigation. |
| `X-Powered-By` | *removed* | No `Express` fingerprint. |

---

## Audit log

Every privileged action writes a row to `AuditLog` (via Prisma extension hooks where applicable, or explicit `auditLog.create` calls in services). Visible in the admin Dashboard "Recent activity" card and `Inventory → Audit trail` tab.

Coverage: inventory adds/edits, bill creation, expense entry, lead status change, storefront publish, user role change. **Missing**: login successes/failures, refresh token issuance, 2FA changes — track these next.

---

## Things that are NOT in scope today

- WAF / DDoS protection (Cloudflare layer not configured).
- Per-IP geo-blocking.
- Server-side session list (refresh-token rotation logs).
- Penetration test report — has not been done. Engage one before onboarding any merchant who deals in >₹50 lakh/day.
- PCI-DSS scope — we do not store card numbers; payments via UPI/Razorpay tokens only. SAQ-A applies if Razorpay is used.

---

## Reporting a vulnerability

Email **security@anantkamal.in** (placeholder — owner to set up). Include reproduction steps and impact assessment. We acknowledge within 48 hours; coordinated disclosure preferred.
