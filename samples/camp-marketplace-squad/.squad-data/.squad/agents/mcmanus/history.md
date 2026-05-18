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

## Learnings
### 2026-05-18

**SunnyDays — Kids Summer Camps Marketplace — developer output**

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
