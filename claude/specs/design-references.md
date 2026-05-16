# Design References

Two reference universes. Storefront pulls from Indian jewellery leaders. Admin pulls from the best modern SaaS dashboards. Both are explicit about **what we copy** and **what we deliberately avoid**.

Before any UI work on a given surface, Claude re-reads the relevant section.

---

## Storefront + Business Website

### Reference brands (study these)

| Brand | URL | What to study |
|---|---|---|
| **Tanishq** | tanishq.co.in | Hero pacing, editorial photography, collection storytelling, mobile PDP layout |
| **CaratLane** | caratlane.com | Product card density, filter UX, navigation, "try at home" pattern (skip in v1) |
| **Bluestone** | bluestone.com | Pricing transparency (gold rate breakdown), GST/making charge disclosure |
| **Mejuri** | mejuri.com | Type system, whitespace, restraint, lookbook pages |
| **Aurate** | auratenewyork.com | Photography composition, scroll storytelling |

### What we copy from Tanishq

1. **Hero — single hero image, full bleed, editorial**, with a small typeset overline and one CTA. No carousel.
2. **Collection navigation that reads like a magazine TOC.** Section names: "Bridal", "Daily wear", "Festive", "By occasion".
3. **Image-led category pages.** Photography takes 70%+ of the viewport. Text labels are quiet.
4. **Transparent pricing on PDP.** Show gold weight, current rate, making charges, GST as separate lines. Customers trust it.
5. **Store locator front and center.** Indian customers want to see the physical shop before they buy online.

### What we deliberately do NOT copy from Tanishq

1. The legacy navigation strip with 14 categories — too dense. We use 5–6 collections max.
2. The pop-up modal on landing. Hostile.
3. The 90s-style breadcrumb trails. Drop those.
4. Tanishq's footer is bloated. Ours is sparse.

### What we copy from Bluestone

1. **The gold rate ticker** — small, top of page, "Today's 22K: ₹6,420/g". Builds price trust.
2. **The pricing breakdown table on PDP** (weight × rate + making + stone + GST = total).

### What we deliberately do NOT copy from Bluestone

1. Bluestone uses too many carousels and animations. The brand feels less premium because the design works too hard.
2. Their "lifetime exchange" popups are over-the-top. We mention exchange policy quietly on PDP.

### What we copy from Mejuri / Aurate

1. **Generous whitespace, serif display fonts, restraint.**
2. **Lookbook-style story pages** for collections (long-form scroll with images and short paragraphs).
3. **Sticky add-to-cart bar on mobile PDP.**

### Storefront layout rules

- Max content width: `1280px`. Hero can go full-bleed.
- Section vertical padding: `py-24` desktop, `py-16` mobile.
- Product grid: 2 columns mobile, 3 tablet, 4 desktop. Never 5 (cramped) or 6 (chaos).
- Body line length: max `65ch`.
- Sticky header that shrinks on scroll (logo + 5 nav items + cart + account + search).
- WhatsApp floating button (bottom-right, 56×56, brand-400 fill, white WhatsApp glyph).

### Photography guidance (specs only; we don't generate images)

- Studio: matte off-white background (#F4F2EE).
- Lifestyle: warm natural light, soft shadows, mid-tone skin in frame.
- Macro on PDP: at least one 1:1 detail shot showing the texture / setting.
- No drop-shadow PNGs with white halos. Compose with the background, not against it.

---

## Admin + POS

### Reference products (study these)

| Product | URL | What to study |
|---|---|---|
| **Linear** | linear.app | Density, keyboard shortcuts, command palette, motion, color restraint |
| **Vercel Dashboard** | vercel.com | Empty states, metric cards, table density, log viewers |
| **Stripe Dashboard** | stripe.com (Dashboard previews) | Financial table design, money formatting, side panels for detail views |
| **Notion** | notion.so | Sidebar nav patterns, inline editing |
| **Cron / Notion Calendar** | cron.com | Keyboard-driven calendars, range pickers |

### What we copy from Linear

1. **The sidebar.** Single-line items, tiny icons, hover state slight bg-shift, active state subtle left-border in brand-400.
2. **Command palette (`cmd+k`).** Fuzzy search across navigation + actions + recent.
3. **Inline edit.** Click a status or assignee in a row, edit in place via popover. Never modal for tiny edits.
4. **Calm color use.** Brand color only for primary CTA, active nav state, key links. Everything else ink-neutral.
5. **Keyboard shortcuts on every action.** `c` to create, `e` to edit, `?` for help.
6. **Toast (sonner) at top-right.** Not center. Not bottom. Not animated bouncing.
7. **Motion under 200ms.** Anything slower feels broken on a power tool.
8. **Tables, not cards.** When data is rows-of-the-same-thing, it's a table. Cards are for heterogeneous items.

### What we deliberately do NOT copy from Linear

1. Linear's all-purple identity. Our brand color is gold; we use it more sparingly.
2. Linear's heavy "command" verbal style. Indian jewellers won't say "triage." We say "follow up", "new bill", "send WhatsApp".
3. Issue-tracker mental model. Our domain is bills + inventory + customers — different primitives.

### What we copy from Vercel

1. **Empty states that show the structure.** "You don't have any items yet — here's how the import works." Not a sad illustration.
2. **Skeleton loaders.** Always. Never spinners.
3. **Toggle between graph and table for any metric.** Reuse the same data with two views.
4. **Side panels (Sheet) for detail views.** Click a row → slides in from right → no page navigation, full context preserved.

### What we copy from Stripe

1. **Money formatting discipline.** Right-aligned, mono font, lakh/crore Indian grouping (`₹1,24,500.00`).
2. **Activity feed pattern** for a bill, lead, or customer — chronological events in a left-margin timeline.
3. **Receipts that look like receipts.** Not "modern fluffy invoices" — clean, scannable, with a printable mono variant.

### Admin layout rules

- Layout: **fixed left sidebar (240px) + main area**, no top nav (Linear-style).
- Sidebar collapses to icon-only at `< 1280px`.
- Page content max width: `1440px`, centered. Forms max width `720px`, centered within page.
- Section padding: `p-6` (24px). Card padding: `p-4` (16px). Compact table padding: cell `px-3 py-2`.
- **Sticky top bar inside main area** with: ShopSwitcher (left), search/cmd+k trigger (middle), notifications + avatar (right).
- Mobile admin: collapses to a slide-in sidebar (Sheet). Tables become scrollable horizontally with sticky first column.

### POS layout (tablet-first, 1024×768+)

- **Three-pane layout** at tablet landscape:
  - Left (~300px): Cart / current bill — items, charges, GST, total
  - Center (~500px): Product search + scan input + numeric keypad
  - Right (~280px): Customer panel (lookup, loyalty, hold/resume, payment)
- Touch targets minimum 44×44.
- Numbers in mono font, large (24–28px) so they read across the counter.
- "Send WhatsApp receipt" is a single, prominent button after payment.
- Offline indicator: a small ink-700 dot turns warning-500 when offline; pending sync count shown beside.

---

## Forbidden patterns (both surfaces)

- Carousels on hero
- Auto-playing video
- Modal popups for newsletter / discount on landing
- Lottie animations as decoration
- Generic illustration packs (undraw, storyset, manypixels)
- "AI-default" gradient backgrounds (purple → pink, blue → cyan)
- Tooltip-as-help-text (bury info in tooltips → bad). Inline helper text instead.
- Emoji icons in admin UI
- Bouncing notification badges
- "Click here to..." link copy

## When in doubt

- Storefront: **would a 50-year-old shop owner's daughter, looking at this on her phone before her wedding shopping, feel like this brand is premium and trustworthy?** If not, push the design further.
- Admin: **would a Linear engineer using this for 6 hours a day get annoyed at anything?** Animations too slow, click depth too deep, color too loud — fix it.

## Verification using Playwright MCP

After implementing any new screen, run the Playwright MCP to:
1. Open the page in dev
2. Take screenshots at 1440px, 1024px, 768px, 375px
3. Compare against the rules above (visually, by Claude reading the screenshot)
4. Flag any rule violations before declaring the feature done

This is mandatory for any new admin page or storefront section.
