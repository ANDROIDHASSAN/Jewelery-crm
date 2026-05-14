Audit the codebase for tenant isolation bugs. This is the most critical invariant in Gold OS — see `specs/gotchas.md`.

Check:

1. Every `$queryRaw` or `$executeRaw` — does it include `WHERE tenant_id = $X`?
2. Every Express route file — does it sit behind both `auth` and `tenant-scope` middleware? Are those middleware registered in the right order in `server/src/index.ts`?
3. Every BullMQ worker — does it call `runWithTenant(tenantId, ...)` before any DB call?
4. Every new database table since the last audit — does it have a `tenantId` column? Indexed?
5. Every list endpoint — is there an e2e test proving tenant A can't read tenant B's data?

Output a report grouped by severity (CRITICAL / HIGH / MEDIUM). For each issue, show file:line and a one-paragraph fix proposal. Do not fix anything yet.
