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

## Learnings
### 2026-05-18

**SunnyDays — Kids Summer Camps Marketplace — tester output**

Based on the actual shipped code, here are the 6 AC/risk bullets:

- **Browse AC:** All 8 camps render as cards on load with emoji, title, category badge, age range, dates, location, price, and description. Filter buttons (All + 6 categories: Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts, Culinary) correctly show/hide cards; "All" is active by default. ✅ Button shows "✓ Added!" feedback for 900ms then resets.

- **Cart AC (add/remove/qty):** `addToCart` increments qty if camp already in cart — confirm badge reflects cumulative count. `−` button at qty=1 removes the line entirely (via `changeQty` → `<= 0` guard); `Remove` button does immediate delete. Cart badge = sum of all `qty` values. Empty state renders dashed-border message, not a broken layout.

- **Checkout AC:** Form requires all 4 fields (name, email, card, expiry) via HTML `required` + `type="email"`. Submit with empty cart triggers `alert()` + redirect to browse — **risk:** no validation on card format or expiry pattern beyond `maxlength="19"`; mock only, but parents may enter garbage and still get an order ID. Order ID format: `SUN-` + `Date.now().toString(36).toUpperCase()` — confirm uniqueness across rapid sequential submissions.

- **Edge cases to test:** (a) Proceed-to-checkout with empty cart → alert fires, cart not corrupted. (b) Rapid double-click "Add to cart" — button is disabled for 900ms, but two fast clicks before disable could race; verify `existing.qty++` branch fires correctly. (c) Qty incremented to large numbers (e.g., 99) — subtotal displays as integer `$28305`, no locale formatting or overflow guard. (d) Navigating Browse→Cart→Browse→Cart without adding anything — `renderCart` called twice; confirm no duplicate empty-state nodes.

- **Accessibility/keyboard:** Nav buttons and filter buttons are `<button>` elements — keyboard-focusable ✅. Cart `−`/`+`/Remove buttons have no `aria-label`; screen readers will announce "−" and "+" literally — **flag for review.** Checkout form uses `<label>` wrapping `<input>` correctly ✅. No `lang` attr on `<html>` — present (`lang="en"`) ✅. Color contrast: `--muted: #6b7280` on `--bg: #fff7ed` is borderline (~3.9:1); fails WCAG AA for small text — **risk.**

- **Data-loss-on-reload (in-memory tradeoff):** `cart` is a plain JS `let` array — browser refresh wipes it silently. No `sessionStorage`/`localStorage` fallback. A parent who builds a 4-camp cart, steps away, and returns to a refreshed tab loses all selections with zero warning. Per Builder's spec this is intentional for v1, but must be called out in release notes and is the primary driver for v2 persistence work.
