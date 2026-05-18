# Project Context

- **Owner:** DemoUser
- **Agent:** McManus — Developer
- **Role:** Developer
- **Onboarded:** 2026-05-18

## Core Context

SunnyDays — a kids summer camp marketplace with browse, cart, and mock checkout.

## Recent Updates

📌 Agent McManus — Developer onboarded on 2026-05-18

## Learnings

Ready to contribute to the team.

## SunnyDays — Kids Summer Camps Marketplace — developer output — 2026-05-18T09:08:13.440Z

**Implementation plan — SunnyDays v1**

- **Stack:** Vanilla HTML/CSS/JS, zero frameworks, zero build step. Single self-contained `output/index.html`. In-memory `cart` array scoped to the browser tab; no `localStorage`, no fetch calls after initial load.
- **Components:** `<header>` nav (Browse / Cart with badge) → three `<section class="view">` panels: Browse (filter bar + card grid), Cart (item rows + summary block), Checkout form → Confirmation panel. View switching via `goTo()` toggling `.active` class.
- **Data model:** `Camp { id, title, category, ageRange, dates, location, price, emoji, description }[]` — 8 records hardcoded in `app-template.ts`. Cart state: `{ campId: string, qty: number }[]`. No ORM, no schema — plain arrays with `find/filter/reduce`.
- **Routing/state:** Client-side only. `goTo(viewName)` is the router. Reactive state flows one direction: user action → mutate `cart[]` → `renderCart()` / `updateBadge()`. No event bus; direct DOM re-renders keep complexity near zero.
- **Accessibility:** Semantic `<button>`, `<form>`, `<label for>` elements throughout. `lang="en"` on `<html>`. Badge count exposed as visible text. Filter and quantity buttons are keyboard-focusable native elements. Color contrast meets WCAG AA against the warm-orange brand palette.
- **Deliverable:** `./output/index.html` — single file, ships via `core.ts → buildAppHtml(spec)` → written to disk. Served by `serve.ts` on `:4200`.

```json
{
  "brandColor": "#f59e0b",
  "brandColorDark": "#d97706",
  "heroTitle": "☀️ SunnyDays — Summer Camps",
  "heroTagline": "Browse hand-picked camps for kids ages 5–13, build your perfect summer, and check out in minutes.",
  "ctaLabel": "Reserve spot",
  "featuredCategory": "All"
}
```
