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


## SunnyDays — Kids Summer Camps Marketplace — tester output — 2026-05-18T09:08:41.203Z

- **Browse view AC:** All 8 camp cards render on load with emoji, title, age range, dates, price, category badge, and description visible. Category filter chips update the grid immediately — selecting a category hides non-matching cards; "All" restores all 8. Zero cards shown when a category has no matches must display a non-empty fallback message (no silent blank grid).

- **Cart AC (add / remove / qty):** "Reserve spot" adds the camp to cart and increments the nav badge. Adding the same camp a second time increments quantity rather than duplicating the row. Qty `+`/`−` controls update line price and subtotal live; `−` at qty=1 removes the row entirely. Removing all items returns to an empty-cart state with a prompt to browse — subtotal and total must both read `$0.00`, not stale values.

- **Checkout AC:** Form blocks submission when any of the three fields (parent name, email, mock card) is empty. Email field must reject malformed input (no `@`). On valid submit: order confirmation panel displays a non-empty generated order ID, the cart empties (badge resets to 0), and the user cannot navigate "back" into a populated cart. Confirmation panel must not be reachable by direct `goTo()` call with an empty cart.

- **Edge cases:** Empty-cart checkout attempt → form is either unreachable or submit is blocked with a visible error, never silently succeeds. Duplicate "Reserve spot" clicks (fast double-tap) must not create two separate rows for the same camp. Qty pushed to very large values (e.g., 999) must not overflow or NaN the subtotal. Filter change while items are in-cart must not reset cart state.

- **Accessibility / keyboard:** Every nav button, filter chip, qty control, and "Reserve spot" CTA must be reachable and activatable via `Tab` + `Enter`/`Space` alone. Cart badge count must be surfaced to screen readers (e.g., `aria-label="Cart, 3 items"`). Checkout form fields need associated `<label>` elements — verify no inputs are label-orphaned. Focus must not trap inside any view panel.

- **Data-loss-on-reload (in-memory tradeoff):** Confirmed v1 design decision: all cart and order state is tab-scoped and resets on reload. This is a known limitation, not a bug — but the UI must **not** imply persistence (no "saved" language, no localStorage writes). Risk: users who accidentally refresh mid-checkout lose their cart silently. Recommend a `beforeunload` warning as a low-cost mitigation for v2 consideration; flag for PM sign-off before v1 ships.
