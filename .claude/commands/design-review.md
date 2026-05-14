Run a design review on the most recently modified UI files.

1. Identify which surface the changes belong to (admin or storefront) — check the route path and which feature folder the changes live in.
2. Load `.claude/skills/frontend-design.md`, `specs/design-system.md`, and `specs/design-references.md`.
3. Make sure the dev server is running. If not, ask me to start it.
4. Use the playwright MCP to:
   - Navigate to the affected pages
   - Screenshot at 1440px, 1024px, 768px, 375px
5. For each screenshot, write a review comparing it against the rules:
   - **Storefront:** serif display fonts, generous whitespace, no carousel/popup, image-led, transparent pricing
   - **Admin:** dense tables, mono numbers in money/weight columns, borders not shadows, brand color used sparingly, cmd+k present
6. List every violation. For each, show the specific rule from the spec, the screenshot evidence, and a one-paragraph fix proposal.

Do not fix anything until I approve.
