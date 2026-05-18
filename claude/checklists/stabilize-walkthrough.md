# Stabilize — browser walkthrough checklist

Last automated check: 2026-05-19. Tick through every box below in one
session before showing this build to a real jeweller. Stops when something
breaks; report the failing step + screenshot back to me.

## Setup (one-time)

- [ ] `cd server && npm run dev` — server on :4000
- [ ] `cd client && npm run dev` — client on :3000
- [ ] (Optional) `cd server && npm run dev:worker` — needed only for gold-rate cron + WhatsApp send

## Automated checks (run before manual)

Run these first — if they fail, no point doing the manual walkthrough yet.

- [ ] `npm run test:tracking` — full order lifecycle E2E (target: 7/7 green)
- [ ] `npm run test:isolation` — cross-tenant data leak check (target: 12/12 passed)
- [ ] `npm run test:load` — 100% success at 20 concurrent (target: 0 errors)

## Customer storefront — happy path

- [ ] Open `http://localhost:3000/store` — homepage loads under 2s, gold-rate ticker shows real numbers
- [ ] Browse a collection: `/store/collections/bridal` — products render with images
- [ ] Click any product → PDP loads, "Add to bag" works
- [ ] Open `/store/cart` — your piece appears with correct price + GST
- [ ] Click "Place order" → modal opens
- [ ] Enter name + phone → submit
- [ ] **CHECK:** lands on `/store/order/success/<id>` with big order number + expected delivery date
- [ ] Click "Track now" → `/store/track/<id>` shows 1 event ("Order placed")
- [ ] **CHECK:** the heartbeat dot pulses, page polls every 10s

## Customer storefront — return visit (cart + wishlist persistence)

- [ ] Open `/store/account` (now signed in from the order above)
- [ ] **CHECK:** "My Orders" panel lists the order you just placed with current status
- [ ] Add another piece to cart from a PDP
- [ ] Open another browser tab → `/store/cart` — same item appears (DB sync)
- [ ] Add a piece to wishlist (heart icon)
- [ ] Open another tab → `/store/wishlist` — same piece appears

## Admin — receive and process the order

- [ ] Open `http://localhost:3000/admin` (login: `owner@goldos.dev` / `Owner@2026demo`)
- [ ] **CHECK:** bell icon shows a number badge equal to PENDING count from live banner
- [ ] Click bell → dropdown opens, your order is at the top with "just now" timestamp
- [ ] Click the notification → lands on `/admin/ecommerce?orderId=<id>` with order drawer open
- [ ] **CHECK:** drawer shows timeline with "Order placed" event, customer phone, items
- [ ] Drag the order (Kanban view) from PENDING → CONFIRMED → PACKED → SHIPPED
- [ ] **CHECK:** every transition adds a row to the timeline within 10s
- [ ] Type a note: "Hallmark check passed" + location: "Workshop" → "Post update"
- [ ] **CHECK:** new event appears in drawer timeline

## Customer side — live tracking updates

- [ ] Switch back to the `/store/track/<id>` tab from earlier
- [ ] Within 10s **CHECK:** the timeline shows all 4 events (Order placed → Confirmed → Packed → In transit → Hallmark check passed)
- [ ] Status pill stepper has advanced to "In transit"

## Cancel-with-reason flow

- [ ] In admin, change a different order's status to CANCELLED (via list view dropdown or drawer button)
- [ ] **CHECK:** cancel-reason modal opens, won't accept blank
- [ ] Type "Out of stock — alternative offered" → confirm
- [ ] Open that order's `/store/track/<id>` — **CHECK:** customer sees the reason verbatim in the red banner

## Numbers are in sync (post-cleanup)

- [ ] Open `/admin/ecommerce` — live banner shows `NEW (PENDING) X · CONFIRMED Y · ...`
- [ ] Compare the chip values to the Kanban column headers — should be **identical** numbers
- [ ] Compare KPI cards (Open orders, Total revenue, etc.) — all derived from the same `liveCount` source

## Performance feel (subjective)

- [ ] Refresh `/admin/ecommerce` — page should feel instant (under 2s to first paint)
- [ ] Navigate Dashboard → E-Commerce → CRM → Dashboard — should feel snappy (RTK Query cache + Redis cache)
- [ ] Open `/admin` and let it sit — every 10s, the bell badge + live banner should silently update without page reload or visible spinner

## If anything breaks

1. Note the exact step (e.g. "step 7 — cart page")
2. Open browser devtools → Network tab → screenshot the failing request
3. Open server terminal → screenshot the last 20 log lines
4. Send both back

## Known gaps (still in backlog, don't flag)

- [ ] Phone-OTP auth on customer-side (still phone-only)
- [ ] Real WhatsApp template sends (worker is wired, but Meta business API not connected)
- [ ] Subdomain-based tenant resolution (still `?tenant=` for now)
- [ ] CRM family/occasion/gold-credit features (see earlier "how should a jewellery CRM look" reply)
