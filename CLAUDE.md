# Gold OS

Multi-tenant SaaS for Indian jewellery businesses. 7 modules: Stock & Inventory, POS, Finance, E-Commerce, Business Website, Lead CRM + Ads, Analytics. Multi-shop, WhatsApp-first, GST/BIS compliant. Built by Anantkamal Software Labs.

**Stack:** PERN (PostgreSQL + Express + React + Node) with RTK Query.
**Architecture:** Monolith. No microservices. No DevOps complexity.
**Platform:** Web-only v1. POS runs in browser as PWA on a tablet. No React Native.
**Stage:** Greenfield. Solo build. 40-day phased delivery.

## Read these specs before any non-trivial task

- `claude/specs/mission.md` — what we're building, who for, what success means
- `claude/specs/tech-stack.md` — exact versions; do not deviate
- `claude/specs/architecture.md` — monolith structure, request lifecycle
- `claude/specs/features.md` — full feature list per module (definition of done)
- `claude/specs/data-model.md` — database schema and tenant isolation rules
- `claude/specs/api-design.md` — REST conventions, RTK Query patterns
- `claude/specs/design-system.md` — colors, typography, components, the visual bar
- `claude/specs/design-references.md` — Tanishq for storefront, Linear for admin, what to mimic and what not to
- `claude/specs/gotchas.md` — jewellery domain rules + silent-breakage warnings
- `claude/specs/validation.md` — how each module is verified
- `claude/specs/phases.md` — day-by-day build plan

If a spec doesn't answer the question, ask before coding. Never invent domain rules.

## Repository layout

Two folders in one repo. Two `package.json`. Shared types via a tiny `shared/` folder imported by both.

```
gold-os/
├── client/                React 18 + Vite + RTK Query
│   ├── src/
│   │   ├── app/           Store config, RTK Query base
│   │   ├── features/      One folder per module (inventory, pos, finance, etc.)
│   │   ├── components/    Shared UI (built on shadcn/ui + Tailwind)
│   │   ├── pages/         Route components (React Router v6)
│   │   ├── lib/           Money, weight, date, formatting helpers
│   │   └── styles/        Tailwind config, design tokens
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── server/                Express + Prisma + Node 20
│   ├── src/
│   │   ├── modules/       One folder per domain (auth, inventory, pos, finance, crm, ecommerce, analytics)
│   │   │   └── <mod>/     <mod>.routes.ts, <mod>.service.ts, <mod>.schema.ts
│   │   ├── middleware/    auth, tenant-scope, rate-limit, error-handler
│   │   ├── lib/           prisma client, redis client, queue (BullMQ), whatsapp, gold-rate
│   │   ├── workers/       cron jobs (gold rate poller, abandoned cart, follow-ups)
│   │   ├── prisma/        schema.prisma, migrations/, seed.ts
│   │   └── index.ts       Express boot
│   └── package.json
│
├── shared/                Imported by both client and server
│   ├── types.ts           Inferred from Zod
│   ├── schemas.ts         Zod schemas (validation rules, single source of truth)
│   └── constants.ts       Roles, statuses, GST rates, etc.
│
├── claude/                Docs and local scratch (gitignored)
│   ├── specs/             Source-of-truth specs — read these first
│   ├── infra/             nginx config and other deploy bits
│   └── …                  scratch dirs (gold-os-complete, ui-screens, FIRST_PROMPT.md)
├── .claude/               Skills + slash commands (Claude Code config)
└── docker-compose.yml     Postgres + Redis + Meilisearch (local dev only)
```

## Commands

**Setup**
- `npm install` at the **repo root** — this is an npm workspaces repo (`shared`, `server`, `client` are workspaces in the root `package.json`). One install hoists deps to the root `node_modules/`. Do NOT run `npm install` inside `client/` or `server/`; on Windows it can leave a half-installed state that later fails with `ENOTEMPTY: rmdir ...`.
- `docker compose up -d` — Postgres, Redis, Meilisearch on localhost
- `cd server && npm run db:migrate` — apply Prisma migrations
- `cd server && npm run db:seed` — one tenant, two shops, ~50 items, sample customers

**Dev**
- `cd server && npm run dev` — Express on :4000, watches with tsx
- `cd client && npm run dev` — Vite on :3000, proxies `/api` to :4000

**Test**
- `npm test` (in either folder) — Vitest unit tests
- `npm run test:e2e` (root) — Playwright e2e
- `npm run typecheck` — tsc --noEmit

**Quality**
- `npm run lint` — eslint
- `npm run format` — prettier

**Build**
- `cd client && npm run build` — Vite build to `dist/`
- `cd server && npm run build` — tsc to `dist/`
- Server in prod serves `client/dist` as static + the API. One process. One port.

## Code style

- TypeScript strict mode. No `any`. Use `unknown` and narrow.
- **Validation lives in `shared/schemas.ts`** as Zod. Server validates incoming requests; client validates forms. Same schema both sides. Single source of truth.
- **Server module pattern:** `<module>.routes.ts` (Express router, validation, calls service) → `<module>.service.ts` (business logic, Prisma) → returns plain JS objects.
- **Client feature pattern:** `features/<module>/<module>Api.ts` (RTK Query slice) → components import generated hooks (`useGetItemsQuery`, `useCreateItemMutation`).
- **RTK Query is the only HTTP layer on the client.** No fetch/axios anywhere else. Tags drive cache invalidation; every mutation declares `invalidatesTags`.
- Database: Prisma ORM. All tenant-scoped queries go through tenant middleware (see gotchas).
- UI: Tailwind + shadcn/ui. Brand tokens in `client/src/styles/tokens.css`. Component composition over prop sprawl.
- **Money in paise (integer). Weight in milligrams (integer). Never floats.**
- Times stored as UTC, displayed in IST (Asia/Kolkata) via `lib/date.ts`.
- Files: kebab-case. Components: PascalCase. Hooks: camelCase starting with `use`.

## Hard rules (do not violate)

1. **Tenant isolation.** Every tenant-scoped query goes through Prisma middleware injecting `tenantId` from `AsyncLocalStorage`. Raw queries must filter by `tenantId` explicitly. Cross-tenant leak = critical bug.
2. **Money math is integer-only.** Paise (₹1 = 100 paise). Never `parseFloat` a price. Use `Money` from `client/src/lib/money.ts` and `server/src/lib/money.ts` (identical implementation).
3. **Gold rate is cached.** MCX API hits run on a 5-minute cron in `server/src/workers/gold-rate.ts`, write to Redis. Request handlers read Redis. Never call MCX directly from a route.
4. **GST math is centralized.** `server/src/lib/gst.ts` is the only place tax is calculated.
5. **WhatsApp goes through BullMQ.** Direct Meta API calls from request handlers will rate-limit under load. Enqueue. Worker sends.
6. **No PII in logs.** Phone, GST, address, customer name — use `redact()`.
7. **Migrations forward-only.** Never edit a committed migration. Add new.
8. **POS works offline.** IndexedDB queue, syncs when network returns. Web-only does not mean online-only.
9. **Design quality is non-negotiable.** Before any UI work, read `claude/specs/design-references.md` and `claude/specs/design-system.md`. Generic AI-looking UI gets rejected and rebuilt.

## Workflow

- Plan mode (shift+tab) for anything touching more than one file.
- After every feature: `npm run typecheck && npm test && npm run lint` before declaring done.
- New feature → check `claude/specs/features.md` first. Not listed? Ask before building.
- Domain question (making charges, hallmarking, gold loan, exchange flow) → `claude/specs/gotchas.md`.
- Any UI work → load `.claude/skills/frontend-design.md` first. Mandatory.
- Every feature ships with a test or a manual demo path. No exceptions.

## MCP servers in use

The user has configured these MCP servers in `.claude/mcp.json`. Use them when relevant:

- **shadcn-ui** — fetch latest shadcn components on demand (do not copy-paste from old training data)
- **context7** — fetch up-to-date docs for Prisma, RTK Query, Vite, Tailwind, React Router, Express
- **playwright** — drive a browser to verify UI looks right after building it
- **postgres** — query the local DB to sanity-check schema and data during dev
- **filesystem** — already covered by built-in file tools

If an MCP isn't configured but would help (e.g. Figma for design specs, Linear for issue tracking), suggest it; don't fake the call.

## Plugins installed (from `claude-plugins-official`)

These plugins are active in this project. Reach for them when the task fits — don't re-implement what they already do.

**Build & design**
- `frontend-design` — `/frontend-design` skill. Mandatory for any UI work. Produces distinctive, non-generic interfaces. Pair with `claude/specs/design-references.md` and `claude/specs/design-system.md`.
- `ui-ux-pro-max` (from `nextlevelbuilder/ui-ux-pro-max-skill` marketplace) — design intelligence: 67 UI styles, ~160 palettes, font pairings, chart types, UX guidelines. Ships sub-skills `banner-design`, `brand`, `design-system`, `design`, `slides`, `ui-styling`, `ui-ux-pro-max`. Use to pick palette/typography/style direction before `frontend-design` builds the actual components — never let its output override `claude/specs/design-system.md` brand tokens (Tanishq storefront, Linear admin).
- `feature-dev` — `/feature-dev` skill + `code-architect`, `code-explorer`, `code-reviewer` agents. Use for guided feature work that spans more than one file (auth, POS flow, finance ledger, etc.).
- `code-simplifier` — agent. Run after a feature lands to refine code for clarity without changing behavior.

**Review & quality**
- `code-review` — `/review` skill. Use on a PR or pending diff before declaring done.
- `pr-review-toolkit` — adds `/ultrareview` and supporting commands for deeper multi-agent review of a branch or GitHub PR.
- `security-guidance` — `/security-review` skill. Run on anything touching auth, tenant scope, payment, or PII (see Hard rules #1, #6).
- `typescript-lsp` — LSP integration. Trust diagnostics from it over guessing.

**Workflow**
- `commit-commands` — `/commit`, `/commit-push-pr`, `/clean_gone`. Use these instead of hand-rolling git commands.
- `claude-md-management` — `/revise-claude-md`, `/claude-md-improver`. Use when CLAUDE.md needs updates after a session's learnings.
- `skill-creator` — only when authoring or tuning a new skill for this repo (e.g. tenant-check, verify already live in `.claude/skills/`).

**Tooling (MCP)**
- `playwright` — browser automation, required for the "test UI in browser before declaring done" rule.
- `context7` — pulls current docs for Prisma, RTK Query, Vite, Tailwind, React Router, Express. Prefer this over recalled API surface.
- `github` — GitHub operations (issues, PRs, checks). Use over raw `gh` calls when richer context is needed.

When in doubt, check `/help` for the active slash-command list rather than guessing a plugin's command name.

## Out of scope

- Multi-currency. INR only.
- Generic ecommerce (subscriptions, digital goods).
- Custom storefront themes per tenant. One design system, brand colors + logo only.
- Mobile native apps. PWA on tablet is the POS surface for v1.
- Kubernetes, multi-region, microservices. Single-node deployment is the v1 plan.
