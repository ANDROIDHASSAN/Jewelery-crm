# Tech Stack

Exact versions. Do not deviate. If something needs to change, ask first.

## Runtime

- Node.js 20 LTS
- npm 10+
- TypeScript 5.4+, strict mode

## Server — `server/`

| Layer | Choice |
|---|---|
| Framework | Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 |
| Cache + queue | Redis 7 (BullMQ for jobs) |
| Search | Meilisearch (product catalog) |
| File storage | AWS S3 (prod) / MinIO (local) |
| Auth | JWT (access 15min) + refresh (7d httpOnly cookie) + RBAC |
| Validation | Zod (shared with client via `shared/schemas.ts`) |
| Logging | pino (structured, PII-redacted) |
| Error tracking | Sentry |
| Process manager | PM2 (single-node prod) |
| API docs | swagger-ui-express + zod-to-openapi |
| Dev runner | tsx (no ts-node) |
| Test | Vitest + supertest |

## Client — `client/`

| Layer | Choice |
|---|---|
| Framework | React 18 |
| Build | Vite 5 |
| Router | React Router v6 |
| State (server) | RTK Query (Redux Toolkit) |
| State (client) | Redux Toolkit slices (kept minimal) |
| Forms | React Hook Form + Zod (using `shared/schemas.ts`) |
| UI primitives | shadcn/ui (via shadcn-ui MCP) |
| Styling | Tailwind CSS 3 |
| Tables | TanStack Table |
| Charts | Recharts |
| Date | date-fns + date-fns-tz (IST display) |
| Icons | Lucide |
| Toasts | sonner |
| Test | Vitest + React Testing Library |
| E2E | Playwright |

## Shared — `shared/`

Plain TypeScript module, imported by both client and server.
- `schemas.ts` — Zod schemas for every entity, plus form schemas
- `types.ts` — `z.infer` types exported for both sides
- `constants.ts` — roles, statuses, GST rates, purity values, etc.

## Integrations

| Need | Service |
|---|---|
| WhatsApp | Meta Cloud API (primary), Twilio (SMS fallback) |
| Gold rates | MCX live feed (polled every 5 min) |
| Online payments | Razorpay |
| Shipping | Shiprocket (primary), Delhivery (fallback) |
| GST filing | GSP API (GSTN compliant) |
| Ads | Meta Marketing API + Google Ads API |
| Maps | Google Maps Platform |

## Local development

Single `docker-compose.yml` at repo root brings up Postgres, Redis, Meilisearch, MinIO. Nothing else. Server and client run on host with `npm run dev`.

## Production deploy (zero-DevOps target)

The intentionally simple plan, kept here as the canonical truth so Claude never invents Kubernetes mid-build:

- **One server** (Hetzner CX22 or DigitalOcean droplet, India region or Singapore)
- **Managed Postgres** (Hetzner/DO managed DB) or Postgres on same box for v1
- **Redis on same box** (Docker container)
- **PM2** runs the Node server (which serves both `/api/*` and the built React `dist/`)
- **Nginx** in front for SSL termination + static caching
- **Cloudflare** for DNS, CDN, basic WAF, SSL
- **GitHub Actions** to test + build on push, SSH-deploy on merge to main (rsync + pm2 reload)
- **Backups** — `pg_dump` cron to S3 nightly, 30-day retention

No Kubernetes. No microservices. No service mesh. One box, one process, one port. Scale up vertically; revisit when there's a real reason to.

## Versioning rules

- Lockfiles committed in both `client/` and `server/`. Never `--no-frozen-lockfile` in CI.
- Major version bumps require a PR and changelog entry.
- Prisma migrations are forward-only in shared environments.
