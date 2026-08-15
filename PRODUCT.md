# Product

## Register

product

## Users

Four primary actors, all mobile-first, in Andhra Pradesh:
- **Customers** — small business owners / individuals booking cargo trucks (1kg-1000+ tons) and/or Hamali (loading/unloading labor). Often mid-transaction on the street, spotty connectivity, need speed and clarity over choice.
- **Drivers / Hamali workers (solo or Mutha group)** — gig workers on their phone between jobs, need to glance, decide, act in seconds (job offers have a live countdown).
- **Mutha Leaders** — run a labor crew, split one incoming job across multiple members, need a group-command view.
- **Admins / Managers** — internal ops staff at a desk, need dense, trustworthy data tools (tree/org views, audit logs, fare rule editors).

## Product Purpose

FYRO is "Ola/Rapido for logistics" — real-time marketplace matching customers to truck drivers and Hamali labor. Success = a customer can book in under a minute, see an honest live-matching state (never a fake instant match), track the assigned driver/hamali on a real map, and pay/rate at the end. For workers: see a job offer, decide inside a visible countdown, get paid transparently.

## Brand Personality

"Ola meets Linear.app" — clean, minimal, premium, trustworthy. Warm and human (not corporate-cold), confident and fast (not playful/cartoonish). Orange (#FF6B2B) reads as the general/truck action color; teal (#0D9488) reads as Hamali/labor. Never dark mode, never neon, never terminal/hacker aesthetic.

## Anti-references

- Generic SaaS dashboard clichés: hero-metric tiles with gradient accents, identical icon+heading+text card grids, side-stripe colored borders on list items.
- Dark, glassy, neon gig-economy apps (not the target feel — FYRO is warm-beige/premium, not moody).
- Fake/instant matching UI that hides real wait times — the product's honesty about "waiting for driver to respond" is a stated trust principle, not a UX inconvenience to paper over.

## Design Principles

1. **Honesty over polish that lies.** Sequential-offer matching, countdown timers, and "waiting for response" states must always reflect real backend state — never a canned animation implying speed that isn't there.
2. **One-thumb operation.** Every authenticated screen is designed for a phone held in one hand: bottom tab nav, large tap targets (44px+), primary actions reachable by thumb.
3. **Money is never ambiguous.** Fare breakdowns are always itemized and shown before commitment; server is the sole source of truth, client never computes or guesses a total.
4. **Role-appropriate density.** Customer/driver/hamali surfaces stay sparse and calm (consumer app pace); admin/manager surfaces (tables, tree views, audit logs) are allowed denser, more data-forward layouts — same tokens, different rhythm.
5. **Real data, no lorem-ipsum map pins.** Andhra Pradesh geography, real geocoding, real distances — the map is a working tool, not a decorative screenshot.

## Accessibility & Inclusion

WCAG AA minimum: all interactive text/icon colors verified against their background (see DESIGN.md for the -600 shade rule), visible focus rings (never removed), `prefers-reduced-motion` respected globally, 44px minimum touch targets, location-permission-denied handled with a visible explanation (never a silent failure).
