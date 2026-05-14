# Day 1 Kickoff Prompt

Copy this exact text and paste it as your first message to Claude Code, after you've placed all files from this pack into an empty git repository and run `claude` inside it.

---

```
You're starting Gold OS — a multi-tenant SaaS for Indian jewellery businesses.
Stack: PERN monolith (PostgreSQL + Express + React + Node) with RTK Query.
Architecture: one repo, two folders (client/ + server/), one process in prod.
Platform: web-only v1. POS is a PWA on tablet.

Before you write any code:

1. Read CLAUDE.md
2. Read every file in specs/ in this order:
   - mission.md
   - tech-stack.md
   - architecture.md
   - data-model.md
   - features.md
   - api-design.md
   - design-system.md
   - design-references.md
   - gotchas.md
   - validation.md
   - phases.md
3. Read .claude/skills/frontend-design.md
4. Note the MCP servers configured in .claude/mcp.json (shadcn-ui, context7,
   playwright, postgres, filesystem). Use them throughout the project. For UI
   work, the shadcn-ui MCP is mandatory — never copy shadcn code from memory.

5. Then write a PLAN (do not implement yet) for Day 1 from phases.md. Cover:
   - Repo scaffold: client/ (Vite + React 18 + TS), server/ (Express + TS),
     shared/ (Zod schemas + types), .claude/, infra/docker/
   - package.json contents for both client and server with exact deps from
     tech-stack.md
   - docker-compose.yml with Postgres 15, Redis 7, Meilisearch, MinIO
   - Tailwind config with full design tokens from design-system.md
   - client/src/styles/tokens.css with brand + ink + semantic CSS variables
   - shadcn-ui MCP call to fetch latest versions of the base components
     (button, input, dialog, sheet, table, command, sonner, ...)
   - GitHub Actions workflow: typecheck + lint + test on every PR
   - .env.example for each app with every key from gotchas.md
   - Prisma init in server/ with Tenant + Shop models from data-model.md
   - First migration
   - Tenant isolation Prisma extension skeleton (full implementation Day 2)
   - One smoke test per side proving toolchain works

6. List every file you'll create with one-line descriptions.
7. List every command you'll run.
8. Flag anything ambiguous or under-specified — do NOT guess.

After I approve the plan, implement. After implementation:
- run npm run typecheck && npm run lint && npm test in both client/ and server/
- confirm docker compose up works
- update specs/phases.md marking D1 as done with notes on what shipped

Do not implement before I approve the plan. Plan mode now.
```

---

# Subsequent days

For every day after Day 1, use the slash command:

```
/next-day
```

Which automatically reads phases.md, finds the next un-shipped day, loads relevant specs (and the design skill if there's UI work), and plans before implementing.

# For any UI surface

The frontend-design skill is loaded automatically when UI work is detected, but you can force it:

```
Use the frontend-design skill. Build the [page name].
```

# To audit tenant isolation

```
/tenant-check
```

# To verify a day's work

```
/verify
```

# To review the design quality of a UI surface

```
/design-review
```

# When you want to add a feature mid-build

```
Check specs/features.md for [feature name]. If listed, plan it. If not listed,
propose adding it with which module it belongs to and what "done" looks like
before writing any code.
```

# When something breaks

```
Stop. Don't fix it yet. Read the relevant spec file (likely specs/gotchas.md).
Tell me what the spec says about this, propose a fix that aligns with the spec.
If the spec is wrong or silent, propose a spec update first.
```
