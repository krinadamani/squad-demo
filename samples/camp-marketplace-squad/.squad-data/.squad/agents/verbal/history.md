# Project Context

- **Owner:** DemoUser
- **Agent:** Verbal — Scribe
- **Role:** Scribe
- **Onboarded:** 2026-05-18

## Core Context

SunnyDays — a kids summer camp marketplace with browse, cart, and mock checkout.

## Recent Updates

📌 Agent Verbal — Scribe onboarded on 2026-05-18

## Learnings

Ready to contribute to the team.

## Learnings
### 2026-05-18

**SunnyDays — Kids Summer Camps Marketplace — scribe output**

- **What shipped:** `output/index.html` — a self-contained, zero-dependency SPA (15 KB, vanilla HTML/CSS/JS) seeding 8 summer camp cards across 6 categories (Sports, STEM, Aquatics, Arts, Outdoors, Performing Arts + Culinary). Full browse → filter → cart → checkout → confirmation flow; in-memory cart with quantity controls, running subtotal, and mock order-ID generation on submit.

- **How to run:** `npm run serve` from `camp-marketplace-squad/` → open **http://localhost:4200** in any browser. No install step needed beyond `npm ci` if `node_modules` is absent.

- **Known limitations:** State is tab-scoped and resets on refresh (no persistence); mock card field performs no real validation beyond `required`; category filter is a static list (adding a 9th camp requires a manual code edit); no accessibility audit completed; mobile layout untested below 375 px.

- **Recommended next iteration:** Add `localStorage` persistence so the cart survives refresh; extract camp data to a JSON feed so non-engineers can seed new camps; swap mock checkout for a Stripe Elements integration; run Lighthouse a11y audit and fix critical failures.

- **Demo script (3 steps):** ①  On load, click **"STEM"** to filter — confirm 2 cards remain visible. ② Click **"Add to cart"** on *Code Wizards Academy*, watch the button flash ✓ and the cart badge increment; repeat for *RoboBuilders Lab* then open the cart to confirm subtotal. ③ Fill the checkout form (any name, valid email format, 16-digit card, MM/YY expiry) → **Place Order** → confirm the `ORD-XXXXXX` confirmation screen appears.

- **Team credits:** 🎯 **Product Manager** — vision, user stories, and MVP guardrails · 🔨 **Builder** — architecture, data model, and shipped `index.html` · 🔍 **QA Lead** — acceptance criteria and risk coverage · 📝 **Verbal / Scribe** — launch summary and institutional record.
