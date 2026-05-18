# Project Context

- **Owner:** DemoUser
- **Agent:** Fenster — Tester
- **Role:** Tester
- **Onboarded:** 2026-05-18

## Core Context

SunnyDays — a kids summer camp marketplace with browse, cart, and mock checkout.

## Recent Updates

📌 Agent Fenster — Tester onboarded on 2026-05-18

## Learnings

Ready to contribute to the team.



## SunnyDays — Kids Summer Camps Marketplace — tester output — 2026-05-18T16:10:02.295Z

- **Browse AC** — All 8 camp cards render on load; each shows emoji, title, category badge, age range, dates, location, price, and description. Filter bar renders "All" + 6 category pills (Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts, Culinary); active pill is "All" on load; selecting a category shows only matching camps and hides the rest; "All" restores full grid. ✅ button flashes "✓ Added!" for 900ms per click.

- **Cart AC** — "Reserve spot" adds a line at qty 1; repeat clicks increment qty on the existing line (no duplicates). `−` decrements qty; at qty 1 → 0, line auto-removes. `+` increments without cap. "Remove" deletes the line regardless of qty. Cart badge shows total quantity across all lines. Subtotal and Total both reflect `sum(price × qty)` across all lines; they must be equal (no tax/shipping in v1).

- **Checkout AC** — "Proceed to checkout" is only reachable from the cart summary button (no nav tab). Form requires parent name, email (type=email), card number, and expiry — all fields marked `required`; native validation fires on submit. Submitting with a non-empty cart clears cart, sets badge to 0, renders a `SUN-` prefixed order ID in monospace, and navigates to confirmation view. "Browse more camps" returns to browse.

- **Edge cases** — Empty cart: checkout form's `onsubmit` guards with `alert + goTo('browse')`; however the cart view itself shows no "Proceed to checkout" button when empty — both paths should be tested. Duplicate add: correctly increments, not pushes; verify badge reflects cumulative qty not line count. Large qty: no upper bound enforced — `qty` can grow unbounded, total can overflow to non-integer display (price × qty is integer math here so safe for realistic values, but no comma formatting for totals ≥ $1,000). Direct nav to checkout via URL hash is not possible (SPA, no router), so that attack surface is closed.

- **Accessibility / keyboard** — No `aria-label` on icon-only nav buttons (cart badge is inside the button text, acceptable). Filter pills and "Reserve spot" / ghost buttons are native `<button>` elements — focusable by default. However, `−` and `+` quantity buttons have only `−`/`+` as text with no `aria-label="Decrease quantity"` — screen reader will announce bare punctuation. `goTo()` does not move focus to the new view on navigation — keyboard users lose position. Checkout form uses `<label>` wrapping `<input>` (implicit association) — valid, but no `id`/`for` explicit linking; test with VoiceOver/NVDA to confirm announcement.

- **Data-loss-on-reload** — `cart` is a plain JS variable (`let cart = []`); a page refresh, tab close, or browser crash silently discards all cart contents with no warning. No `beforeunload` prompt, no `sessionStorage` fallback. Parents mid-session will lose their selections. Accepted in-memory tradeoff for v1, but a `sessionStorage` sync layer or at minimum a "Your cart will be lost" reload warning is the recommended v2 follow-up. Flag for PM sign-off before launch copy promises "save your cart."
