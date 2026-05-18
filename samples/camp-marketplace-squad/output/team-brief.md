# SunnyDays — Kids Summer Camps Marketplace — Team Delivery

Generated: 2026-05-18T17:57:49.400Z

## BuildSpec (source: builder)

```json
{
  "brandColor": "#f59e0b",
  "brandColorDark": "#d97706",
  "heroTitle": "☀️ SunnyDays Camps",
  "heroTagline": "Find the perfect summer adventure for your kid — browse, compare, and book in minutes.",
  "ctaLabel": "Add to cart",
  "featuredCategory": "All"
}
```

## Product Manager — Keyser — Lead

- **Vision:** SunnyDays is the single place where parents discover, compare, and book kids' summer camps in under five minutes.

- **Top 3 user stories:**
  - *Browse* — As a parent, I can scan camp cards (photo, age range, dates, price, category) and filter by category so I find relevant options fast.
  - *Cart* — As a parent, I can add multiple camps, adjust quantities, and see a running subtotal so I can manage my selections before committing.
  - *Checkout* — As a parent, I can submit my name, email, and mock card details and receive an order ID so I feel the booking is confirmed.

- **Primary success metric:** ≥ 80 % of test-session users who add at least one camp reach the order-confirmation screen without error.

- **MVP scope guardrails:** 8 seeded camps; in-memory state only; filter by category; cart with quantity controls + remove; checkout form producing a mock order ID; single-page app, no auth, no real payments.

- **Non-goals for v1:** User accounts / login, real payment processing, camp provider dashboard, search / sort beyond category filter, waitlists, email confirmation delivery, mobile-native app, analytics instrumentation.

- **Launch readiness signal:** All three user-story flows (browse → filter, add → adjust cart, checkout → order ID) pass manual smoke test on desktop Chrome with zero JS console errors; seeded data renders correctly across all 8 camps.

## Builder — McManus — Developer

- **Stack:** Vanilla HTML/CSS/JS, zero framework dependencies; all state lives in a per-tab `cart` array (`[{ campId, qty }]`); single self-contained `output/index.html` served statically by `serve.ts` on `:4200`
- **Components:** `<header>` (logo + nav + cart badge) → `#view-browse` (filter bar + camp grid) → `#view-cart` (line items + summary) → `#view-checkout` (form) → `#view-confirmation` (order ID); all four are `display:none` sections toggled by `goTo()`
- **Data model:** `Camp { id, title, category, ageRange, dates, location, price, emoji, description }` hardcoded in `CAMPS[]`; cart is `{ campId: string, qty: number }[]` mutated in place; no persistence layer
- **Routing/state:** Hash-free single-page view swap via CSS class `.active`; `cart` array is the sole source of truth — badge, summary, and checkout all derive from it; `renderCart()` and `updateBadge()` called on every mutation
- **Accessibility:** Semantic HTML (`<header>`, `<main>`, `<section>`, `<form>`); `required` on all checkout inputs; CTA buttons carry descriptive text; `<h1>→<h2>→<h3>` hierarchy intact; `lang="en"` on `<html>`
- **Deliverable:** `./output/index.html` — built by `buildAppHtml(spec)` in `app-template.ts`, invoked by `core.ts` after all agents run; no external assets, fully self-contained

```json
{
  "brandColor": "#f59e0b",
  "brandColorDark": "#d97706",
  "heroTitle": "☀️ SunnyDays Camps",
  "heroTagline": "Find the perfect summer adventure for your kid — browse, compare, and book in minutes.",
  "ctaLabel": "Add to cart",
  "featuredCategory": "All"
}
```

## QA Lead — Fenster — Tester

Based on the actual shipped code, here are the 6 AC/risk bullets:

- **Browse AC:** All 8 camps render as cards on load with emoji, title, category badge, age range, dates, location, price, and description. Filter buttons (All + 6 categories: Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts, Culinary) correctly show/hide cards; "All" is active by default. ✅ Button shows "✓ Added!" feedback for 900ms then resets.

- **Cart AC (add/remove/qty):** `addToCart` increments qty if camp already in cart — confirm badge reflects cumulative count. `−` button at qty=1 removes the line entirely (via `changeQty` → `<= 0` guard); `Remove` button does immediate delete. Cart badge = sum of all `qty` values. Empty state renders dashed-border message, not a broken layout.

- **Checkout AC:** Form requires all 4 fields (name, email, card, expiry) via HTML `required` + `type="email"`. Submit with empty cart triggers `alert()` + redirect to browse — **risk:** no validation on card format or expiry pattern beyond `maxlength="19"`; mock only, but parents may enter garbage and still get an order ID. Order ID format: `SUN-` + `Date.now().toString(36).toUpperCase()` — confirm uniqueness across rapid sequential submissions.

- **Edge cases to test:** (a) Proceed-to-checkout with empty cart → alert fires, cart not corrupted. (b) Rapid double-click "Add to cart" — button is disabled for 900ms, but two fast clicks before disable could race; verify `existing.qty++` branch fires correctly. (c) Qty incremented to large numbers (e.g., 99) — subtotal displays as integer `$28305`, no locale formatting or overflow guard. (d) Navigating Browse→Cart→Browse→Cart without adding anything — `renderCart` called twice; confirm no duplicate empty-state nodes.

- **Accessibility/keyboard:** Nav buttons and filter buttons are `<button>` elements — keyboard-focusable ✅. Cart `−`/`+`/Remove buttons have no `aria-label`; screen readers will announce "−" and "+" literally — **flag for review.** Checkout form uses `<label>` wrapping `<input>` correctly ✅. No `lang` attr on `<html>` — present (`lang="en"`) ✅. Color contrast: `--muted: #6b7280` on `--bg: #fff7ed` is borderline (~3.9:1); fails WCAG AA for small text — **risk.**

- **Data-loss-on-reload (in-memory tradeoff):** `cart` is a plain JS `let` array — browser refresh wipes it silently. No `sessionStorage`/`localStorage` fallback. A parent who builds a 4-camp cart, steps away, and returns to a refreshed tab loses all selections with zero warning. Per Builder's spec this is intentional for v1, but must be called out in release notes and is the primary driver for v2 persistence work.

## Launch Lead — Verbal — Scribe

- **What shipped:** `output/index.html` — a self-contained, zero-dependency SPA (15 KB, vanilla HTML/CSS/JS) seeding 8 summer camp cards across 6 categories (Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts + Culinary). Full browse → filter → cart → checkout → confirmation flow; in-memory cart with quantity controls, running subtotal, and mock order-ID generation on submit.

- **How to run:** `npm run serve` from `camp-marketplace-squad/` → open **http://localhost:4200** in any browser. No install step needed beyond `npm ci` if `node_modules` is absent.

- **Known limitations:** State is tab-scoped and resets on refresh (no persistence); mock card field performs no real validation beyond `required`; category filter is a static list (adding a 9th camp requires a manual code edit); no accessibility audit completed; mobile layout untested below 375 px.

- **Recommended next iteration:** Add `localStorage` persistence so the cart survives refresh; extract camp data to a JSON feed so non-engineers can seed new camps; swap mock checkout for a Stripe Elements integration; run Lighthouse a11y audit and fix critical failures.

- **Demo script (3 steps):** ①  On load, click **"STEM"** to filter — confirm 2 cards remain visible. ② Click **"Add to cart"** on *Code Wizards Academy*, watch the button flash ✓ and the cart badge increment; repeat for *RoboBuilders Lab* then open the cart to confirm subtotal. ③ Fill the checkout form (any name, valid email format, 16-digit card, MM/YY expiry) → **Place Order** → confirm the `ORD-XXXXXX` confirmation screen appears.

- **Team credits:** 🎯 **Product Manager** — vision, user stories, and MVP guardrails · 🔨 **Builder** — architecture, data model, and shipped `index.html` · 🔍 **QA Lead** — acceptance criteria and risk coverage · 📝 **Verbal / Scribe** — launch summary and institutional record.
