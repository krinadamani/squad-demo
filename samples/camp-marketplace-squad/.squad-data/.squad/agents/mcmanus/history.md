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

## SunnyDays — Kids Summer Camps Marketplace — developer output — 2026-05-18T16:09:31.846Z

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
