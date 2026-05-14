Read `specs/phases.md` and find the next day not marked as shipped.

For that day:

1. Read every spec file relevant to the day's deliverables. For any UI work, also load `.claude/skills/frontend-design.md`.
2. Write a detailed plan covering:
   - Files you'll create (one-line descriptions)
   - Files you'll modify
   - Commands you'll run
   - shadcn components needed (fetch latest via the shadcn-ui MCP, do NOT copy from memory)
   - Tests you'll write
   - Anything ambiguous or under-specified (flag — do not guess)
3. Wait for my approval before implementing.

After implementation:
- Run `npm run typecheck && npm test && npm run lint` in both `client/` and `server/`
- If the day's work touched UI, use the playwright MCP to screenshot the affected pages at 1440 / 1024 / 768 / 375 and verify against `specs/design-references.md`
- Update `specs/phases.md` marking the day as shipped with notes on what shipped and what slipped
- Commit with message: `D<N>: <brief>` per the day's section title
