# SunnyDays — Kids Summer Camps Marketplace — Team Delivery

Generated: 2026-05-18T08:22:04.901Z

## Product Manager — Keyser — Lead

**SunnyDays Product Brief — v1**

- **Vision:** One place for parents to discover, compare, and book kids' summer camps — no tab-juggling required.

- **Top 3 user stories:**
  - *Browse & filter* — As a parent, I can view 8 camps as cards and filter by category (sports, STEM, arts, outdoors) so I can quickly narrow options for my child's age and interests.
  - *Cart management* — As a parent, I can add multiple camps, adjust quantities, remove items, and see a live subtotal so I know my total commitment before committing.
  - *Checkout* — As a parent, I can enter my name, email, and mock card details and receive an order confirmation ID so I feel the booking is real and traceable.

- **Primary success metric:** ≥80% of sessions that add an item to cart reach a confirmed order ID (cart-to-confirmation rate).

- **MVP scope guardrails:** 8 seeded camps only; in-memory state resets on page reload; single-currency (USD); no authentication; no real payment processing; no email delivery.

- **Non-goals for v1:** Camp provider accounts / admin dashboard · User profiles or booking history · Search / keyword filtering · Reviews or ratings · Real payment gateway · Mobile-native app · Waitlists or availability enforcement.

- **Launch readiness signal:** All 8 camps render with correct metadata; filter, add-to-cart, quantity controls, remove, subtotal, and checkout form all function end-to-end in-browser; order confirmation ID is generated and displayed; no console errors on happy path.

## Builder — McManus — Developer

Here's the v1 implementation plan:

1. **Stack** — Vanilla HTML/CSS/JS, zero frameworks, zero build step. All state in a single `const state = { camps, cart, filters }` object in `app.js`. No localStorage — intentional reset on refresh per PM guardrail.

2. **Components** (logical sections rendered via JS into `#app`):
   - `CampCard` — photo/emoji, name, category badge, age range, dates, price, "Add to Cart" button
   - `FilterBar` — category pill buttons (All · Sports · STEM · Arts · Outdoors) with active state
   - `CartDrawer` — slide-in panel; line items with `±` qty controls + remove `×`; subtotal + total
   - `CheckoutModal` — form (parent name, email, mock card number/expiry/CVV); order confirmation view with generated ID

3. **Data model**:
   ```js
   // Camp
   { id, name, emoji, category, ageMin, ageMax, startDate, endDate, price, description }
   // CartItem
   { campId, qty }
   // State
   { camps: Camp[], cart: CartItem[], activeFilter: string, view: 'browse'|'checkout'|'confirmed' }
   ```

4. **Routing/state** — No router. `state.view` drives which UI section is visible (`display:none` toggling). All mutations go through a central `dispatch(action, payload)` → `render()` cycle. Order ID = `'SD-' + Date.now()`.

5. **Accessibility** — Filter pills are `<button>` elements with `aria-pressed`. Cart drawer uses `role="dialog"` + `aria-modal="true"` + focus trap on open. Form inputs all have associated `<label>`. Color contrast ≥4.5:1 for all text.

6. **Deliverable** — `./output/index.html` (self-contained: inline CSS + JS, no external deps, opens with `file://` in any browser).

## QA Lead — Fenster — Tester

- **Browse AC** — All 8 camps render on load; each card shows emoji, name, category badge, age range (e.g. "5–8"), date range, price, and description. Filtering by any single category hides non-matching cards; "All" restores all 8. Zero camps match an unused filter = empty-state message shown (not blank screen).

- **Cart AC** — "Add to Cart" increments `qty` if camp already in `state.cart` (no duplicate line items). `+` / `−` controls update subtotal in real time; `−` at qty=1 is equivalent to remove. `×` removes line item entirely. Subtotal = Σ(price × qty); total equals subtotal (no tax/fees in v1 scope). Cart badge/count reflects live item count.

- **Checkout AC** — Form requires all three fields (name, email, mock card); submission blocked if any empty. Email field rejects non-`@` strings. On valid submit, a unique order ID is generated and displayed (format verifiable, e.g. non-empty alphanumeric string). Cart clears post-confirmation. No real payment call — mock card field accepts any digits.

- **Edge cases** — Checkout CTA disabled / hidden when cart is empty (prevent zero-item order). Adding the same camp twice via "Add to Cart" merges into one line item (qty +1), not two rows. Qty upper bound: test at qty=99 — subtotal arithmetic must not overflow or NaN. Filter + add-to-cart combo: filtered-out camps must remain in cart (filter is display-only, not destructive).

- **Accessibility / keyboard** — All interactive controls (filter pills, Add to Cart, `±`, `×`, Checkout submit) reachable and activatable via Tab + Enter/Space. Cart drawer and checkout modal must trap focus while open; Escape closes them. Category badges and price values need sufficient color contrast (WCAG AA). `<button>` elements used — not `<div onClick>` — per Builder's zero-framework stack.

- **In-memory tradeoff** — Explicitly documented risk: any page refresh wipes `state` (cart, filters, in-progress checkout). This is a **known, intentional v1 tradeoff** per PM guardrail — but QA must verify it doesn't cause silent data corruption (no partial-state hydration). Acceptance test: refresh mid-checkout → lands on fresh browse view, no JS errors, no ghost cart state. Flag for v2: localStorage or session persistence should be the first resilience story.

## Launch Lead — Verbal — Scribe

- **What shipped** — SunnyDays v1: a zero-dependency, single-file vanilla HTML/CSS/JS app with 8 seeded camps (sports, STEM, arts, outdoors). Delivers full browse → cart → checkout flow: category filter pills, camp cards (emoji · age range · dates · price · description), slide-in cart drawer with ± qty controls and live subtotal, and a checkout modal that emits a unique order confirmation ID. All state is in-memory; no backend.

- **How to run it** — `npm start` (lets Squad build `output/index.html`) then `npm run serve` → open **http://localhost:4200**. Health check available at `/health`.

- **Known limitations** — State resets on page refresh (intentional v1 guardrail, no localStorage/backend). Single-page app served as one HTML file — deep-link and browser-back are unsupported. Mock card field is purely presentational; no validation beyond non-empty. No tax, fees, or promo codes. No accessibility audit completed.

- **Recommended next iteration** — Persist cart to `localStorage` so refresh doesn't lose selections. Add age-range and date-range filters (QA flagged empty-state path; needs real filter combinations to surface it). Wire a real payment gateway stub (Stripe test mode). Add keyboard nav + ARIA roles for a11y compliance.

- **Demo script (3 steps)** — ① Open `http://localhost:4200`, click **STEM** pill — confirm only STEM camps appear; click **All** to restore all 8. ② Click **Add to Cart** on two different camps; open the cart drawer, tap `+` on one item and watch the subtotal update live. ③ Click **Checkout**, fill name / email / mock card, submit — note the generated order ID displayed on the confirmation screen.

- **Team credit** — PM (product brief & success metrics) · Builder (stack decision, component architecture, data model) · QA Lead (acceptance criteria for browse, cart, and checkout) · **Verbal / Scribe** (this launch summary, institutional record).
