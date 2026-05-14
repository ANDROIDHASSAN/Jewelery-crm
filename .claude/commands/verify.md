Run the full verification suite from `specs/validation.md`:

1. In `server/`: `npm run typecheck && npm run lint && npm test`
2. In `client/`: `npm run typecheck && npm run lint && npm test`
3. From repo root: `npm run test:e2e` (only if dev servers are running; if not, say so)
4. If the current day's deliverables include UI, use playwright MCP to take screenshots at 1440 / 1024 / 768 / 375 of the new pages and verify against `specs/design-references.md` rules.

For each failure, show the exact error, file/line, and propose a fix. Do not fix anything until I approve.

If everything passes, summarize what was tested and confirm the current day's deliverables in `specs/phases.md` are met.
