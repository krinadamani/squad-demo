# Project Context

- **Owner:** DemoUser
- **Agent:** Keyser — Lead
- **Role:** Lead
- **Onboarded:** 2026-05-18

## Core Context

SunnyDays — a kids summer camp marketplace with browse, cart, and mock checkout.

## Recent Updates

📌 Agent Keyser — Lead onboarded on 2026-05-18

## Learnings

Ready to contribute to the team.

## Learnings
### 2026-05-18

**SunnyDays — Kids Summer Camps Marketplace — lead output**

- **Vision:** SunnyDays is the single place where parents discover, compare, and book kids' summer camps in under five minutes.

- **Top 3 user stories:**
  - *Browse* — As a parent, I can scan camp cards (photo, age range, dates, price, category) and filter by category so I find relevant options fast.
  - *Cart* — As a parent, I can add multiple camps, adjust quantities, and see a running subtotal so I can manage my selections before committing.
  - *Checkout* — As a parent, I can submit my name, email, and mock card details and receive an order ID so I feel the booking is confirmed.

- **Primary success metric:** ≥ 80 % of test-session users who add at least one camp reach the order-confirmation screen without error.

- **MVP scope guardrails:** 8 seeded camps; in-memory state only; filter by category; cart with quantity controls + remove; checkout form producing a mock order ID; single-page app, no auth, no real payments.

- **Non-goals for v1:** User accounts / login, real payment processing, camp provider dashboard, search / sort beyond category filter, waitlists, email confirmation delivery, mobile-native app, analytics instrumentation.

- **Launch readiness signal:** All three user-story flows (browse → filter, add → adjust cart, checkout → order ID) pass manual smoke test on desktop Chrome with zero JS console errors; seeded data renders correctly across all 8 camps.
