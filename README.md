# Gold OS — Claude Code Starter Pack (PERN edition)

Complete context bundle for building Gold OS with Claude Code.

## What's inside

```
gold-os-starter/
├── CLAUDE.md                     Loaded automatically every Claude Code session
├── FIRST_PROMPT.md                Copy-paste prompt for Day 1
├── README.md                      This file
├── specs/
│   ├── mission.md                 What we're building and why
│   ├── tech-stack.md              PERN versions, no ambiguity
│   ├── architecture.md            Monolith structure, request lifecycle, why
│   ├── features.md                Canonical feature list (definition of done)
│   ├── data-model.md              DB schema + tenant isolation rules
│   ├── api-design.md              REST + RTK Query patterns
│   ├── design-system.md           Tokens, type, components — both surfaces
│   ├── design-references.md       Tanishq for storefront, Linear for admin
│   ├── gotchas.md                 Jewellery domain + PERN-specific traps
│   ├── validation.md              How every module is verified
│   └── phases.md                  Day-by-day 40-day plan
└── .claude/
    ├── mcp.json                   MCP servers (shadcn-ui, context7, playwright, postgres, filesystem)
    ├── skills/
    │   └── frontend-design.md     Auto-loaded for UI work
    └── commands/
        ├── next-day.md            /next-day → plan the next un-shipped day
        ├── verify.md              /verify → typecheck + lint + test + design review
        ├── tenant-check.md        /tenant-check → audit tenant isolation
        └── design-review.md       /design-review → Playwright screenshots vs spec
```

## Stack at a glance

- **Backend:** Node 20 + Express + Prisma + Postgres 15 + Redis 7 + Meilisearch
- **Frontend:** React 18 + Vite + RTK Query + Tailwind + shadcn/ui
- **Architecture:** Monolith. Two folders (client/ + server/) in one repo. One process in prod (Node serves API + built React).
- **Web-only v1.** POS is a PWA on tablet — installable, offline-capable via Dexie + Workbox.
- **DevOps:** Single server. PM2. Nginx. Cloudflare. No Kubernetes, no microservices.

## Setup (one time)

```bash
# 1. Create empty git repo
mkdir gold-os && cd gold-os && git init

# 2. Copy all files from this pack into the repo
#    (after unzipping, copy the contents — not the folder itself — into your repo root)

# 3. Install Claude Code
npm install -g @anthropic-ai/claude-code

# 4. Install the MCP servers configured in .claude/mcp.json
#    Claude Code will auto-install on first use, but you can pre-install:
npx -y @jpisnice/shadcn-ui-mcp-server --version
npx -y @upstash/context7-mcp --version
npx -y @playwright/mcp --version

# 5. Open Claude Code
claude

# 6. Paste the prompt from FIRST_PROMPT.md as your first message
```

## Daily workflow

- Start each session with `/next-day` — Claude finds the next un-shipped day in `phases.md` and plans it
- Approve the plan, let it implement
- Run `/verify` before declaring the day done
- Run `/design-review` after any UI work to compare screenshots vs `design-references.md`
- Run `/tenant-check` after any feature touching DB queries

## Why this gives 100% on first try

- **CLAUDE.md under 200 lines** — Claude actually follows it instead of ignoring half
- **Specs do the heavy lifting** — loaded on demand, not on every prompt, so context stays clean
- **Design references are explicit** — Tanishq, Linear, Mejuri, Vercel — no generic AI-default UI
- **MCPs replace memory** — shadcn-ui fetches latest components, context7 fetches latest docs for Prisma/RTK/Vite
- **Playwright MCP is the design auditor** — screenshots vs spec rules, automatic
- **Gotchas captured upfront** — jewellery domain rules won't have to be re-learned via bugs
- **Definition of done is explicit** — features.md prevents scope drift, validation.md prevents "looks done" without being done

## Update the specs when

- Wrong thing built twice → that pattern goes into `gotchas.md`
- New feature requested mid-build → add to `features.md` first, then build
- Design rule violation → tighten `design-references.md`
- Tech stack changes → `tech-stack.md` is the source of truth

## Anti-patterns to avoid

- Long, repeated prompts (the specs replace these)
- Asking Claude to "remember" something (it can't — write it in CLAUDE.md or a spec)
- Skipping plan mode for multi-file changes
- Editing committed Prisma migrations
- Float math for money
- shadcn copy-paste from memory (use the MCP)
- Skipping the design review on UI work
