---
name: frontend-design
description: Load this skill before writing or modifying any UI in the Gold OS project. Covers the dual design language (Tanishq-grade storefront, Linear-grade admin), token usage, shadcn integration via MCP, and the Playwright screenshot review step.
---

# Frontend design skill

Before any UI work, this skill runs. It tells Claude how to design at the bar Gold OS requires.

## The two languages

Gold OS has two surfaces with two different design vocabularies:

- **Storefront + business website** — editorial, cinematic, jewellery-luxury. References: Tanishq, CaratLane, Mejuri.
- **Admin + POS** — dense, calm, keyboard-first SaaS. References: Linear, Vercel dashboard.

Before any UI file is touched, identify which surface it belongs to and load the corresponding section of `specs/design-references.md`.

## Required reads

1. `specs/design-system.md` — tokens, type scale, spacing, components
2. `specs/design-references.md` — references and forbidden patterns

These two files are non-optional. Skip them and the UI gets rejected at design review.

## Process

### 1. Determine surface
"Is this admin or storefront?" If it's a shared atom (Button, Input), it lives in both — design tokens make it adapt.

### 2. Get the right shadcn component
Use the **shadcn-ui MCP server** to fetch the latest version of any shadcn component before installing it. Do NOT copy-paste from training data; shadcn updates often.

### 3. Apply tokens, not hex
Never write raw hex colors in components. Use Tailwind classes that resolve to CSS variables:
- `bg-brand-400`, `bg-ink-25`, `text-ink-800`, `border-ink-100`
- Never `bg-[#C99B2A]` or inline styles

### 4. Spacing follows the rule
- Admin: `p-6` section, `p-4` card, `space-y-3` field gap, `text-sm` body
- Storefront: `py-24` section, `gap-8` grid, `text-base` body, serif on headlines

### 5. Component composition over prop sprawl
A component with 12 boolean props is wrong. Compose smaller components. Example:

```tsx
// Wrong
<DataTable bordered striped sortable searchable filterable />

// Right — compose
<Card>
  <CardHeader>
    <SearchInput />
    <FilterDropdown />
  </CardHeader>
  <Table>...</Table>
</Card>
```

### 6. Empty states are content, never illustrations
Show what would appear here. Suggest the next action. No undraw / storyset / Lottie.

### 7. Numbers in mono
Any column of numbers (money, weights, counts) uses `font-mono`. Right-align. Indian grouping (`₹1,24,500.00`).

### 8. Motion budget
- Hover transitions: 120ms ease-out
- Modal/sheet enter: 200ms
- Page transitions: fade only, never slide
- Respect `prefers-reduced-motion`: keep opacity, drop transforms

### 9. Verify with Playwright MCP

After implementing the component or page, before declaring done:

```
Use the Playwright MCP to:
1. Open the page in the dev server
2. Screenshot at 1440px, 1024px, 768px, 375px
3. Visually compare each screenshot against the rules:
   - Storefront: serif display? generous whitespace? no carousel? no popup?
   - Admin: dense tables? mono numbers? sidebar fixed? cmd+k present?
4. List any rule violations
```

If violations exist, fix and re-screenshot. Do not declare the feature done until the design passes.

## Common mistakes the design review catches

- Gradient backgrounds anywhere → flat surfaces only
- Drop shadows on every card → borders only in admin
- Brand color used everywhere → restraint: CTAs, active state, key links
- Title Case headings → sentence case is default
- Carousel on storefront hero → one strong image
- Popup on storefront landing → never
- Tooltip used as help text → put helper text inline
- Modal for a tiny edit → use a popover or inline edit
- Spinner for loading → use skeleton
- Toast in the center / bottom → top-right (sonner default)
- Newsletter signup as a popup → footer placement only

## The taste test

Before submitting a UI for review, Claude asks itself:

**Storefront:** Would a customer about to spend ₹1,00,000 on jewellery feel like this brand is premium and trustworthy? If they'd close the tab, push the design further.

**Admin:** Would a power user running this 6 hours a day get annoyed at anything — click depth, motion lag, color noise? If yes, fix it before shipping.

If the answer is "maybe", the answer is no. Iterate.
