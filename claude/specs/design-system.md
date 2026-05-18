# Design System

The visual bar for Gold OS. Every UI decision is made against this. Generic AI-default UI gets rejected.

There are two surfaces with two distinct languages:

| Surface | Reference | Language |
|---|---|---|
| **Storefront + Business Website** | Tanishq, CaratLane, Bluestone, Mejuri | Editorial, cinematic, image-led, luxurious |
| **Admin + POS** | Linear, Vercel dashboard, Stripe Dashboard | Dense, calm, keyboard-friendly, data-first |

Both share the same brand color tokens, type family, and atom-level components — they diverge in spacing, density, and tone.

---

## Brand tokens

Defined in `client/src/styles/tokens.css`. Overridable per tenant via CSS variables set at the root after auth.

```css
:root {
  /* Brand ramp — default "Gold OS gold". Per-tenant overrides set --brand-* values. */
  --brand-50:  #FAF5E8;
  --brand-100: #F1E5BE;
  --brand-200: #E6D08D;
  --brand-300: #D7B655;
  --brand-400: #C99B2A;   /* primary */
  --brand-500: #A87F1E;
  --brand-600: #856515;
  --brand-700: #604910;
  --brand-800: #41320A;
  --brand-900: #251D05;

  /* Ink (neutral, warm) — text, surfaces, borders */
  --ink-0:   #FFFFFF;
  --ink-25:  #FAF9F7;     /* page bg (admin) */
  --ink-50:  #F4F2EE;
  --ink-100: #E9E6E0;
  --ink-200: #D8D3CA;
  --ink-300: #B8B1A4;
  --ink-400: #948D80;
  --ink-500: #6E695F;
  --ink-600: #4B4740;
  --ink-700: #322F2A;
  --ink-800: #1F1D1A;     /* primary text */
  --ink-900: #0F0E0C;

  /* Semantic */
  --success-50: #E6F4EA; --success-500: #2E8B57; --success-700: #1E5E3A;
  --warning-50: #FCF1DD; --warning-500: #C68920; --warning-700: #8A5C12;
  --danger-50:  #FBEAEA; --danger-500:  #B53A3A; --danger-700:  #7A2424;
  --info-50:    #E6EFF5; --info-500:    #2E6EA6; --info-700:    #1B4368;

  /* Typography */
  --font-display: 'Fraunces', 'Cormorant Garamond', Georgia, serif;   /* storefront only */
  --font-sans:    'Inter', system-ui, -apple-system, sans-serif;       /* admin + body */
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;           /* numbers in tables */

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Shadows — admin uses almost none; storefront uses sparingly */
  --shadow-sm: 0 1px 2px rgba(15, 14, 12, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 14, 12, 0.06);
  --shadow-lg: 0 12px 40px rgba(15, 14, 12, 0.10);

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms;
  --dur: 200ms;
  --dur-slow: 400ms;
}
```

## Tailwind setup

In `client/tailwind.config.ts`, extend with CSS variables (so per-tenant rebranding is free):

```ts
extend: {
  colors: {
    brand: { 50:'var(--brand-50)', 100:'var(--brand-100)', /* ... */ 900:'var(--brand-900)' },
    ink:   { 0:'var(--ink-0)', 25:'var(--ink-25)', /* ... */ 900:'var(--ink-900)' },
    success: { 50:'var(--success-50)', 500:'var(--success-500)', 700:'var(--success-700)' },
    warning: { 50:'var(--warning-50)', 500:'var(--warning-500)', 700:'var(--warning-700)' },
    danger:  { 50:'var(--danger-50)',  500:'var(--danger-500)',  700:'var(--danger-700)'  },
    info:    { 50:'var(--info-50)',    500:'var(--info-500)',    700:'var(--info-700)'    },
  },
  fontFamily: {
    display: 'var(--font-display)',
    sans:    'var(--font-sans)',
    mono:    'var(--font-mono)',
  },
  borderRadius: {
    sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)',
  },
  boxShadow: {
    sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)',
  },
}
```

## Typography scales

### Admin scale (dense, calm — Linear-style)

| Token | Size / line / weight | Use |
|---|---|---|
| `text-xs`  | 12/16, 500 | Helper text, table column header, badges |
| `text-sm`  | 13/20, 400 | **Default body in admin.** Table cells, form fields, sidebar |
| `text-base`| 14/22, 400 | Paragraph in admin |
| `text-md`  | 15/24, 500 | Card titles, section headings |
| `text-lg`  | 18/28, 500 | Page H1 (admin) |
| `text-xl`  | 22/30, 500 | Modal H1, dashboard hero number |
| `text-2xl` | 28/36, 600 | Major metric, KPI |

Admin uses Inter throughout. Numbers in tables use `font-mono` to align columns visually.

### Storefront scale (editorial — Tanishq-style)

| Token | Size / line / weight | Use |
|---|---|---|
| `display-xl`  | 56/64, 400, Fraunces  | Hero headline |
| `display-lg`  | 40/48, 400, Fraunces  | Section headline |
| `display-md`  | 32/40, 400, Fraunces  | Product H1 |
| `display-sm`  | 24/32, 400, Fraunces  | Card title |
| `body-lg`     | 17/28, 400, Inter     | Story paragraph |
| `body`        | 15/24, 400, Inter     | Default body |
| `body-sm`     | 13/20, 400, Inter     | Captions, metadata |
| `eyebrow`     | 11/16, 600, Inter, letter-spacing: 0.12em, uppercase | Section labels |

Display fonts are serif (Fraunces, optical-sized). Body stays Inter for legibility.

## Spacing

8-point grid. Admin uses tighter spacing than storefront.

- Admin section padding: `p-6` (24px). Card padding: `p-4` (16px). Form field gap: `space-y-3` (12px).
- Storefront section padding: `py-24 px-6` (96px vertical). Hero: `py-32 md:py-48`. Grid gaps: `gap-8` (32px) or wider.

## Component principles

### Admin (Linear/Vercel-grade)

- **Density:** Fit more on screen. Table rows 40px tall. Buttons 32px (sm) or 36px (md). Inputs 36px.
- **Borders over shadows.** 1px `border-ink-100` separators. No drop shadows on cards.
- **No icons-as-decoration.** Icons only when they carry meaning (status, action verb, navigation).
- **Keyboard first.** Every action has a shortcut. `?` opens a shortcut help dialog. `cmd+k` opens a global command palette.
- **Calm color.** Brand color used sparingly — primary CTAs, links, active nav state. Most of the UI is ink-neutral.
- **Empty states are content, not jokes.** Show what would appear here, suggest the next action, never use illustration filler.
- **Animations are 120–200ms ease-out.** Anything longer feels slow on a working tool.

### Storefront (Tanishq/Mejuri-grade)

- **Imagery first.** Every product photo gets generous space. Pages breathe.
- **Editorial typography.** Display serif for headlines. Generous letter-spacing on eyebrows.
- **Gold accents, not gold backgrounds.** Use brand-400 sparingly — on CTAs, on key product metadata, on borders. Backgrounds stay ink-25 / ink-0.
- **No carousels on hero.** One strong image. Tanishq does this. Bluestone over-rotates carousels and it cheapens the brand.
- **Asymmetric grids on collection pages.** Boring grids feel like Amazon. Editorial grids feel like a boutique.
- **Cinematic transitions.** Fade-in on scroll (intersection observer + transform). Never carousels, never autoplaying video.
- **Filters are a side panel.** Never a top bar of dropdowns — feels like Flipkart.

## Shared atoms (shadcn/ui base, customized)

Build using the **shadcn-ui MCP** to get the latest components, then theme via tokens above. Never copy-paste old shadcn code from training data — versions drift.

Components to install via shadcn CLI:
- `button` `input` `label` `textarea` `select` `checkbox` `radio-group` `switch`
- `dialog` `sheet` `drawer` `popover` `tooltip` `dropdown-menu` `context-menu`
- `table` `tabs` `accordion` `command` (for cmd+k palette)
- `toast` (replaced with `sonner` — already in dependencies)
- `avatar` `badge` `separator` `skeleton` `progress` `scroll-area`
- `form` (react-hook-form integration)
- `calendar` `date-picker`

Custom additions (in `client/src/components/ui/`):
- `Money` — formats paise with ₹ and lakh/crore grouping
- `Weight` — formats mg as "12.345 g"
- `Purity` — renders "22K" / "18K" / silver / platinum chip
- `ShopSwitcher` — header dropdown for multi-shop
- `DataTable` — TanStack Table wrapper with cursor pagination, column visibility, sticky header
- `MetricCard` — KPI tile (Linear-style)
- `EmptyState` — content-first empty state, never illustrations
- `ConfirmDialog` — typed destructive confirmation with required text input for dangerous actions

## Patterns

### KPI card (admin)

```
┌──────────────────────────┐
│ TODAY'S SALES            │  ← eyebrow, ink-500
│ ₹18,42,000               │  ← text-2xl mono
│ ▲ 12% vs yesterday       │  ← success-500 with tiny arrow
└──────────────────────────┘
```

- White surface (`ink-0`), `border-ink-100`, `rounded-md`, `p-4`.
- Eyebrow uppercase 11px ink-500.
- Number `text-2xl font-mono font-semibold ink-800`.
- Delta in success/danger 500.

### Data table (admin)

- Sticky header, scroll body.
- Row height 40px.
- Hover: `bg-ink-25`. Selected: `bg-brand-50`.
- Right-align numeric columns, font-mono.
- Status column uses `Badge` (pill, soft fill: e.g. success-50 bg + success-700 text).

### Form (admin)

- Label above input, 13px ink-700, weight 500.
- Helper text below, 12px ink-500.
- Error text 12px danger-700.
- Input `h-9 border-ink-200 rounded-md focus:border-brand-400 focus:ring-2 ring-brand-400/20`.
- Submit button on the right, `Cancel` on the left, in a sticky footer for long forms.

### Storefront product card

- Square or 4:5 aspect image, full-bleed.
- Image on hover: subtle zoom (1.03 scale, 400ms ease).
- Below: product name `display-sm`, price `body-sm font-mono`, optional discount tag.
- No "Add to cart" button on the card — pushes them to PDP. Tanishq does this.
- **Wishlist exception:** wishlist cards may surface a quiet inline "Move to bag" action because the page is a pre-purchase shortlist, not a discovery surface. Keep it as a text-link in eyebrow style (11px uppercase, `brand-700`, underline-on-hover) — never as a pill or filled button, so the image remains the hero of the card.

### Storefront PDP

- 60/40 split: image gallery left, info right.
- Image gallery: vertical thumbnail strip on desktop, dot indicators on mobile.
- 360° viewer is a small button that opens a fullscreen modal.
- Price block shows: weight, purity, making charges line item, total — all transparent.
- "Available at <shop name>, <city>" line before CTA.
- Sticky bottom bar on mobile (price + CTA).

### Command palette (admin)

`cmd+k` opens a `command` dialog. Contains:
- Quick actions: New bill, New customer, Add item, Switch shop, Logout
- Navigation: jump to any module
- Recently viewed
- Help / Shortcuts

## Motion

- Hover: `transition-colors duration-fast`.
- Modal/sheet enter: `duration` opacity + transform.
- Page transitions in storefront: fade only, no slides.
- Reduced motion: respect `prefers-reduced-motion` — disable transforms, keep opacity.

## Accessibility floor

- All interactive elements reachable by keyboard.
- Focus rings visible (`focus:ring-2 ring-brand-400/40 ring-offset-2 ring-offset-ink-0`).
- Contrast ratios meet WCAG AA against the background they sit on.
- Form fields paired with labels (`htmlFor`).
- Dialogs trap focus and restore it on close.
- Toast announcements use `aria-live="polite"`.

## Anti-patterns (will not pass review)

- Drop shadows on every card. (Use borders.)
- Gradient backgrounds anywhere except a single hero overlay if needed.
- Stock illustrations from undraw / storyset. We don't ship those.
- Emoji as icons. Use Lucide.
- "Fun" microcopy in admin. ("Oops!" "Looks like..." — no.)
- Carousels on storefront hero. One image, one message.
- 60+ pixel page padding on admin (wastes space) or under 64px on storefront (cramped).
- Brand color on more than two surfaces in one viewport.
- Title Case everywhere — sentence case is the default. Only product/proper names get Title Case.
