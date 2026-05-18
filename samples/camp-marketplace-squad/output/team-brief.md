# SunnyDays — Kids Summer Camps Marketplace — Team Delivery

Generated: 2026-05-18T16:10:27.255Z

## BuildSpec (source: builder)

```json
{
  "brandColor": "#f59e0b",
  "brandColorDark": "#d97706",
  "heroTitle": "☀️ SunnyDays Camps",
  "heroTagline": "Find the perfect summer adventure for your kid — browse, compare, and book in minutes.",
  "ctaLabel": "Reserve spot",
  "featuredCategory": "All"
}
```

## Product Manager — Keyser — Lead

- **Vision** — SunnyDays is the single destination where parents discover, compare, and book kids' summer camps in one seamless checkout.

- **Top 3 user stories** — (1) As a parent, I browse 8 camp cards filtered by category so I can quickly surface relevant programs. (2) As a parent, I add multiple camps to a cart with quantity controls so I can book for siblings in one session. (3) As a parent, I complete a checkout form and receive an order ID so I have confirmation without creating an account.

- **Primary success metric** — ≥80% of sessions that add ≥1 camp to cart complete checkout (cart-to-order conversion).

- **MVP scope guardrails** — 8 seeded camps across ≥3 categories; browse + filter + card detail; cart with quantity/remove + subtotal/total; single-page checkout with parent name, email, mock card, and generated order ID; in-memory state only.

- **Non-goals for v1** — User accounts / authentication; real payment processing; camp provider portal / CMS; search / sort beyond category filter; availability or capacity enforcement; mobile native app.

- **Launch readiness signal** — All 8 camps renderable as cards; category filter narrows results correctly; cart CRUD and totals accurate; checkout produces a non-empty order ID; zero console errors on the happy path end-to-end.

## Builder — McManus — Developer

- **Stack** — Vanilla HTML/CSS/JS, zero dependencies, zero build step. All state lives in a `let cart = []` array scoped to the browser tab; no `localStorage`, no backend calls. Single `<script>` block inline in the HTML.
- **Component breakdown** — `<header>` (logo + nav tabs + cart badge) → `#view-browse` (filter bar + card grid) → `#view-cart` (line items + quantity controls + summary panel) → `#view-checkout` (form) → `#view-confirmation` (order ID display). Views toggled via `display: none / block`; no router library needed.
- **Data model** — `CAMPS: Camp[]` (id, title, category, ageRange, dates, location, price, emoji, description) baked into `<script>` at build time. `cart: { campId: string, qty: number }[]` held in-memory; derived totals computed on every render — no derived cache.
- **Routing/state strategy** — Single `goTo(viewName)` function swaps the `.active` class on views and nav buttons; cart badge recomputed via `cartCount()` on every mutation. `checkout-form.onsubmit` drains the cart and mints `SUN-<base36 timestamp>` order ID. Full re-render on every cart mutation (8 camps, negligible cost).
- **Accessibility** — Semantic `<header>`, `<nav>`, `<main>`, `<section>`, `<form>` landmarks; all interactive elements are `<button>` or `<input>` (never `<div onclick>`); `<label>` elements wrap each form field; `lang="en"` on `<html>`; filter/nav buttons carry visible text; quantity buttons use `−`/`+` glyphs with surrounding `<strong>` count for context.
- **Deliverable** — `./output/index.html` — single self-contained file produced by `buildAppHtml(spec)` in `app-template.ts`, emitted by the pipeline in `core.ts`.

```json
{
  "brandColor": "#f59e0b",
  "brandColorDark": "#d97706",
  "heroTitle": "☀️ SunnyDays Camps",
  "heroTagline": "Find the perfect summer adventure for your kid — browse, compare, and book in minutes.",
  "ctaLabel": "Reserve spot",
  "featuredCategory": "All"
}
```

## QA Lead — Fenster — Tester

- **Browse AC** — All 8 camp cards render on load; each shows emoji, title, category badge, age range, dates, location, price, and description. Filter bar renders "All" + 6 category pills (Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts, Culinary); active pill is "All" on load; selecting a category shows only matching camps and hides the rest; "All" restores full grid. ✅ button flashes "✓ Added!" for 900ms per click.

- **Cart AC** — "Reserve spot" adds a line at qty 1; repeat clicks increment qty on the existing line (no duplicates). `−` decrements qty; at qty 1 → 0, line auto-removes. `+` increments without cap. "Remove" deletes the line regardless of qty. Cart badge shows total quantity across all lines. Subtotal and Total both reflect `sum(price × qty)` across all lines; they must be equal (no tax/shipping in v1).

- **Checkout AC** — "Proceed to checkout" is only reachable from the cart summary button (no nav tab). Form requires parent name, email (type=email), card number, and expiry — all fields marked `required`; native validation fires on submit. Submitting with a non-empty cart clears cart, sets badge to 0, renders a `SUN-` prefixed order ID in monospace, and navigates to confirmation view. "Browse more camps" returns to browse.

- **Edge cases** — Empty cart: checkout form's `onsubmit` guards with `alert + goTo('browse')`; however the cart view itself shows no "Proceed to checkout" button when empty — both paths should be tested. Duplicate add: correctly increments, not pushes; verify badge reflects cumulative qty not line count. Large qty: no upper bound enforced — `qty` can grow unbounded, total can overflow to non-integer display (price × qty is integer math here so safe for realistic values, but no comma formatting for totals ≥ $1,000). Direct nav to checkout via URL hash is not possible (SPA, no router), so that attack surface is closed.

- **Accessibility / keyboard** — No `aria-label` on icon-only nav buttons (cart badge is inside the button text, acceptable). Filter pills and "Reserve spot" / ghost buttons are native `<button>` elements — focusable by default. However, `−` and `+` quantity buttons have only `−`/`+` as text with no `aria-label="Decrease quantity"` — screen reader will announce bare punctuation. `goTo()` does not move focus to the new view on navigation — keyboard users lose position. Checkout form uses `<label>` wrapping `<input>` (implicit association) — valid, but no `id`/`for` explicit linking; test with VoiceOver/NVDA to confirm announcement.

- **Data-loss-on-reload** — `cart` is a plain JS variable (`let cart = []`); a page refresh, tab close, or browser crash silently discards all cart contents with no warning. No `beforeunload` prompt, no `sessionStorage` fallback. Parents mid-session will lose their selections. Accepted in-memory tradeoff for v1, but a `sessionStorage` sync layer or at minimum a "Your cart will be lost" reload warning is the recommended v2 follow-up. Flag for PM sign-off before launch copy promises "save your cart."

## Launch Lead — Verbal — Scribe

- **What shipped** — `output/index.html` (15 749 bytes, zero dependencies, zero build step): 8 seeded camp cards across 6 categories (Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts + Culinary), filter bar, in-memory cart with quantity controls and auto-remove at 0, subtotal/total panel (no tax), and a mock checkout form that emits a generated order ID on submit.

- **How to run it** — `npm run serve` → open **http://localhost:4200**. (Run `npm start` first only if `output/index.html` is missing; the file is already on disk.)

- **Known limitations** — State is tab-scoped only (cart resets on refresh); no auth, no real payment processing, no backend persistence; order IDs are not stored anywhere; mobile layout untested; no accessibility audit completed.

- **Recommended next iteration** — Wire `localStorage` so the cart survives a page reload; add a camp detail modal (Builder flagged `goTo` is extensible); introduce real form validation + error states; run Lighthouse on mobile and fix any a11y failures before broader promotion.

- **Demo script (3 steps)** — ① Open http://localhost:4200 and click the **STEM** filter pill — confirm only STEM camps appear. ② Click **Reserve spot** on two different camps; watch the cart badge increment and the button flash "✓ Added!"; open the cart and use **+**/**−** to adjust quantities, then verify subtotal updates live. ③ Click **Proceed to checkout**, fill in any parent name, email, and mock card number, submit — confirm an order ID appears on the confirmation screen.

- **Team credits** — Product Manager (vision, user stories, success metric) · Builder (vanilla HTML/CSS/JS architecture, data model, component breakdown) · QA Lead (acceptance criteria for browse, cart, and checkout flows) · Verbal / Scribe (this launch summary).
