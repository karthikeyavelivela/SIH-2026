# Design

## Visual Theme

Warm-minimal, light-only. Beige/off-white base, not stark white — "paper" avoided via layered warm shadows and a raised-white card surface, not flat borders. Two brand hues split by domain: orange for trucks/general, teal for Hamali/labor. Generous radius (14-32px) reads soft/premium rather than sharp/corporate.

## Color

Strategy: **Restrained** (tinted neutrals + orange as the dominant accent, teal as a secondary domain-marker used deliberately, not decoratively).

| Role | Value | Use |
|---|---|---|
| Background | `#FAFAF8` | Page background |
| Surface | `#F2EFE9` | Recessed surface (inputs, subtle panels) |
| Surface raised | `#FFFFFF` | Cards, elevated panels |
| Primary | `#FF6B2B` | Decorative fills, icons, illustration only (fails AA for text/fill-under-white) |
| Primary-600 | `#BF5020` | Button fills, links, text-on-light — the interactive orange |
| Secondary | `#0D9488` | Decorative Hamali-domain fills/icons |
| Secondary-600 | `#0A6F66` | Interactive teal (buttons, links) |
| Text primary | `#0F0E0C` | Body/heading text |
| Text muted | `#6B6860` | Secondary text, captions |
| Border | `rgba(15,14,12,.08)` | Hairline dividers |
| Border strong | `rgba(15,14,12,.14)` | Hover/focus-adjacent borders |

Rule: never use bare `--color-primary`/`--color-secondary` as a button fill or body-text color — always the `-600` shade (AA-checked). Bare values are for large decorative fills/icons only.

## Typography

- Headings: **Syne** (`--font-syne`), bold/extrabold, tight letter-spacing (-0.02em at h1).
- Body: **Outfit** (`--font-outfit`).
- Fluid scale via `clamp()`: xs 0.72-0.8rem, sm 0.85-0.95rem, base 1-1.06rem, lg 1.15-1.35rem, xl 1.5-1.9rem, 2xl 2-2.75rem, hero 2.75-4.75rem.

## Elevation & Shape

- Radius scale: sm 8px, md 14px, lg 22px, xl 32px.
- Shadows are warm-tinted and layered (ambient + contact pass), never a flat single `0 2px 4px rgba(0,0,0,.1)`. `shadow-glow-primary`/`shadow-glow-secondary` are tinted colored glows for primary CTA hover states.
- Depth comes from shadow + the surface/surface-raised split, not borders. Avoid bordered-flat cards.

## Motion

- `ease-out-expo` for standard transitions, `ease-spring` for playful confirmations.
- Durations: fast 150ms (hover/focus), base 250ms (standard), slow 500ms (page-level reveals).
- `prefers-reduced-motion: reduce` is respected globally — never animate without the fallback.
- Never animate layout properties (width/height/top/left) — transform/opacity only.

## Components (established patterns)

- `Button`, `Card` (elevation prop: flat/raised), `Badge`, `Modal` in `client/src/components/ui/`.
- `BottomTabNav` — fixed bottom tab bar, present on every authenticated role layout, `max-w-lg mx-auto` content column even on desktop (mobile-first, not mobile-only).
- Icons are inline SVG components in `components/ui/icons.tsx` (no icon-font dependency).
- Admin-only: `TreeView`, `UserTable`, `PermissionPicker` in `components/admin/` — denser, table/tree-forward, still on the same token set.

## Layout

- Consumer/worker screens: single `max-w-lg mx-auto px-5` column, generous 24px section rhythm, bottom nav clearance (`pb-24` or safe-area padding).
- Admin screens: full-width data layouts (tables, tree views), same spacing tokens but higher density.
- 8pt spacing rhythm via `--space-*` tokens.

## Accessibility

AA contrast enforced via the base/-600 shade split (see Color). `:focus-visible` always styled (2px solid primary-600, 3px offset), never suppressed. 44px minimum interactive target height.
