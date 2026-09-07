# FYRO — Design Tokens, extracted from the design images

**Provenance.** `design-reference/` was empty when I started, so I populated it from the
design export's own rendered screenshots (`design/stitch_export/.../<screen>/screen.png`
→ `design-reference/<screen>.png`, 104 files). Those PNGs are the designs as rendered.

Every colour below was **sampled from those pixels** with a counting script
(`scratchpad/sample_colors.py`, `find_hues.py`) across ten screens spanning five roles —
customer (household home, login, labour, transport, tracking, profile, bookings), worker,
society, admin. Type sizes were **measured** by scanning dark-pixel row runs
(`measure_type.py`). Where a measured value matched the token config embedded in the
export's own markup, I say so — that's corroboration, not the source.

Screens read in full before writing this: `household_home`, `login`,
`hamali_labour_standard`, `goods_transport`, `worker_dashboard_online`,
`society_governance`, `admin_overview`, `customer_profile_1`, `live_tracking_1`,
`dial_component_study_1`.

---

## 1. COLOUR

### Surfaces — the bone family

Sampled dominance across all ten screens: `#FDF9F0` is 19–34% of every screen. This is
the substrate everything sits on.

| Semantic name | Hex | Where measured |
|---|---|---|
| `surface` (page background) | `#FDF9F0` | every screen, 19–34% of pixels |
| `surface-container-low` | `#F7F3EA` | 11–20% — section panels, `worker_dashboard_online` cards |
| `surface-container` | `#F1EEE5` | 8–14% — input fills, `login` phone/passkey fields |
| `surface-container-high` | `#ECE8DF` | 2–10% — inner wells, `live_tracking_1` tab track |
| `surface-container-highest` | `#E6E2D9` | `household_home` chips |
| `surface-container-lowest` (white card) | `#FFFFFF` | 14–18% on `society_governance`, `customer_profile_1`, `live_tracking_1` |
| `surface-dim` | `#DDDAD1` | `live_tracking_1` map base |

### Brand accents — three domain colours, one per mode

| Semantic name | Hex | Where measured |
|---|---|---|
| `primary` (brown, ink-level) | `#4A2A16` | 88k px — display headings, primary buttons (`login` "Authorize Passbook Session"), active tab pills |
| `primary-container` (brown, surface-level) | `#64402A` | 112k px — dark cards (`worker_dashboard_online` AI card, `live_tracking_1` security card), avatars, dial disc |
| `secondary` (dark green) | `#4B6700` | 30k px — CTAs (`hamali_labour_standard` "Continue with 4 workers"), links, positive text |
| `secondary-container` (lime) | `#C4EF68` | 40k px — badges, the online-toggle bar, "Call Directly" button, metric numbers on dark |
| `secondary-fixed-dim` (lime, deeper) | `#ABD552` | progress fills |
| `tertiary` (slate) | `#2A3342` | 85k px — admin sidebar (`admin_overview`), transit CTA (`goods_transport` "Review & Book Fleet") |
| `tertiary-container` (slate, lighter) | `#404959` | 16k px — transit selected cards, chips |
| `tertiary-fixed` (pale slate) | `#DAE3F7` | `goods_transport` "Priced for: Visakhapatnam" chip |

**Mode → accent mapping, confirmed visually:** household = brown, hamali/labour =
green/lime, transit = slate. `goods_transport` uses slate for every selected state and its
CTA; `hamali_labour_standard` uses lime/green for the same roles.

### Pale accent tints (selected-state fills)

Measured as distinct flat colours, not alpha composites — worth naming rather than
writing `bg-lime/20`:

| Name | Hex | Where |
|---|---|---|
| `lime-tint-1` | `#EBF6C6` | `hamali_labour_standard` selected scale/engagement cards (26k px) |
| `lime-tint-2` | `#E6F5BA` | selected chips, duration tiles |
| `lime-tint-3` | `#DBF3A1` | `worker_dashboard_online` online bar |

### Text

| Name | Hex | Where |
|---|---|---|
| `on-surface` (near-black, warm) | `#1C1C16` | body copy, `worker_dashboard_online` display heading |
| `on-surface-variant` (secondary text) | `#50443E` | sub-lines under headings |
| `outline` (muted/meta) | `#83746D` | eyebrow labels, timestamps, "/ HOUR" units. Sampled anti-aliased runs cluster `#948A82`–`#B0A295`, i.e. this hue over bone |
| `outline-variant` (hairline) | `#D5C3BA` | row separators, dividers |
| on dark surfaces | `#FDF9F0` / white | text on brown and slate cards |

### Status

| Name | Hex | Where measured |
|---|---|---|
| `error` | `#BA1A1A` | `goods_transport` "MANDATORY", `admin_overview` "Open Grievances" 24 + "Resolution target 94%" |
| `error-container` | `#FFDAD6` | `admin_overview` grievances icon chip, "3 Priority" pill |
| `success` / verified | `#4B6700` text on `#C4EF68` | "SECURE GATE" (`login`), "Chartered Active" (`society_governance`), "✓ MEMBER" (`worker_dashboard_online`) |
| `warning` / pending | `#64402A` dot | `admin_overview` "PERISHABLE ALERT" |
| `info` / settled | `#2A3342` dot | `admin_overview` "ESCROW SETTLEMENT" |
| `primary-fixed` (peach stamp) | `#FFDBC8` | `society_governance` "SEALED 2021" circular stamp |

---

## 2. TYPE

Measured on `login.png` (522px wide ≈ 1:1 with CSS px) by scanning dark-pixel row runs.

| Role | Measured | Ratio to body | Family | Weight |
|---|---|---|---|---|
| Display heading | **42px** asc-to-desc, 50px line spacing ("Member Ledger / Access") | **2.4×** | serif | 400 |
| Section heading | ~26–31px ("Chartered Cooperative", `society_governance`; "Access" line = 31px) | 1.6× | serif | 500 |
| Card/list heading | ~20–22px ("Queue Dispatch Standby") | 1.2× | serif | 500 |
| Body | **18px** asc-to-desc, 31px line spacing | 1× | sans | 400 |
| Strong body / labels | **16px** ("Registered Member Contact") | 0.9× | sans | 600 |
| Small label / UI | ~13px ("Aadhaar / Mobile", tab labels) | 0.75× | sans | 500 |
| Eyebrow micro-label | ~11px ("AUTHENTICATION PROTOCOL", "CONSIGNMENT SCALE") | 0.6× | sans | 600 |
| Metric number | **56–64px** ("14" on `live_tracking_1`, "₹2,840" on `worker_dashboard_online`) | 3.5× | serif | 400 |

**Serif vs sans, read off the images:** every heading, every display number, and every
currency figure is **serif**. Everything else — body copy, labels, buttons, chips, nav,
table text — is **sans**. `worker_dashboard_online`'s ₹2,840 and `live_tracking_1`'s "14"
are unmistakably serif; their surrounding labels are unmistakably sans.

**Letter-spacing on uppercase micro-labels:** visibly wide — measured roughly +0.08em on
"AUTHENTICATION PROTOCOL" (`login`) and "CONSIGNMENT SCALE" (`hamali_labour_standard`).
Always uppercase, always 600 weight, always muted or accent-coloured, never ink-black.

**Corroboration:** the export's own embedded token config specifies display-hero-mobile
2.75rem (44px), body-lg 1.0625rem (17px), body-strong 0.9375rem/600, label-ui 0.8125rem,
label-caps 0.6875rem/600/0.08em, data-metric 2.25rem — all within a pixel or two of what
I measured, so the two agree.

**Fonts to load:** a warm high-contrast serif (the export names *Noto Serif*; **Fraunces**
is the closest expressive match and is already wired) and a neutral grotesk (**Inter**).
Plus **Noto Serif Telugu** and **Noto Serif Devanagari**, weight-matched, since headings
appear in Telugu on several screens (`household_mode`, `language_selection`).

---

## 3. SPACING & SHAPE

Measured against the rendered cards; corroborated by the export's own utility classes.

| Token | Value | Evidence |
|---|---|---|
| Card / panel radius | **16px** | every card on `household_home`, `login`, `society_governance` |
| Large feature block radius | **24px** | `hamali_labour_standard` crew-size counter block |
| Button / input / squarish chip radius | **12px** | `login` inputs and primary button, `goods_transport` CTA |
| Inner cell radius | **8px** | nested wells inside cards |
| Pill / badge / avatar radius | **full** | every status pill, every mode chip |
| Tiny tag radius | **4px** | `worker_dashboard_online` inline tags |
| Screen edge padding | **20px** | consistent left/right gutter on all mobile screens |
| Card internal padding | **16px** mobile (20px on feature cards) | `login` form card, `society_governance` white card |
| Gap between sections | **24px** | vertical rhythm on `hamali_labour_standard` |
| Gap between cards in a grid | **12px** | `household_home` guild grid |
| Fixed header height | **64px** | all mobile screens |
| Bottom tab bar height | **80px** on `household_home`/`customer_profile_1`, **64px** on `hamali_labour_standard`/`goods_transport` | measured — an inconsistency in the designs, see §5 |

---

## 4. COMPONENT ANATOMY

### Dark card (`worker_dashboard_online` AI card, `live_tracking_1` security card, `household_home` AC-repair tile)
Brown `#64402A` (or slate `#404959` in transit contexts), radius 16px, padding 16px.
Contents in order: a **lime eyebrow** (uppercase, tracked, ~11px, sometimes with a small
icon chip) → **serif heading in white/bone** (~20–22px) → **body in bone at ~70% opacity**
(~13–15px) → optional inner rows one step darker with a trailing arrow. Prices inside dark
cards are **lime, serif**, right-aligned. Never a border; separation comes from the colour
step alone.

### Light card (`household_home` guild tiles, `society_governance` panels)
`#F7F3EA` or white, radius 16px, no border, no drop shadow beyond a whisper. Optional
icon chip top-left (36px rounded-square, one surface step darker), optional status pill
top-right, then photo (if any), then sans bold title, then muted description, then a
bottom row: **serif price left, uppercase muted unit right** ("₹299" / "/ HOUR").

### Status pill
Height ~24–28px, horizontal padding ~10–12px, fully rounded. Text ~11px uppercase, 600,
tracked. Three variants seen: **lime fill + dark-green text** (positive/active),
**light-grey fill + muted text** (neutral/"Tier 1", "Domestic"), **pink fill + red text**
(critical, `admin_overview`). Some carry a leading 6px dot; the dot is the accent colour.

### Metric block (`worker_dashboard_online`, `live_tracking_1`, `admin_overview` KPIs)
Uppercase tracked eyebrow on top → **giant serif number** (2.4–3.5× body) → unit or label
immediately right of or under the number at ~1× body. The number carries the colour
(lime on light for earnings, brown for neutral, red for breach); the label stays muted.
`live_tracking_1` pairs "14" + "mins" on one baseline with the unit at half the number's
size. A secondary badge may float right (lime rounded-square "2.8 KM LEFT").

### List row (`customer_profile_1` personal record, `society_governance` trustees, `admin_overview` incident queue)
Hairline `#D5C3BA` separators, **no vertical rules, no boxing per row**. Layout: optional
leading avatar/icon (36–44px) → stacked text (tiny uppercase muted label above, bold value
below) → trailing element right (green action link, status text, chevron, or ⋮). Row
height driven by content, ~56–64px typical.

### Bottom tab bar
Full-width fixed, bone at ~90% with blur, hairline top. 4–5 items. Icon ~22–24px above a
~12px sans label, 4px gap. **Active = brown/dark ink icon + label**, inactive = muted.
No pill, no underline, no background change on the active item.

### Photograph treatment
Always inside a rounded container (16px), always with a **gradient scrim** from the mode's
dark accent at the bottom to transparent at the top. Aspect ratios seen: hero ~16:10
(`household_home` electrician), wide strip ~4:1 (`hamali_labour_standard` loading crew),
card thumbnail ~3:2 (guild tiles), circular portrait 1:1 (specialists, `live_tracking_1`
worker). Text sits **over** the scrim at the bottom-left; a badge may float top-right.

### The dial (`dial_component_study_1`)
Brown-to-ink radial disc, centre pinned at the viewport's top-right corner, only the
bottom-left quarter on canvas. Collapsed = ~56px arc sliver. Expanded = full quarter with
three 30° wedges, icons fanned along the tangent, lime highlight on the active wedge, a
stationary indicator notch at the 45° diagonal, and dashed concentric milling rings.

---

## 5. TWO INCONSISTENCIES IN THE SOURCE DESIGNS — BOTH NOW RESOLVED

Both were artefacts of measuring low-resolution `screen.png` thumbnails. Reading the
export's own `code.html` markup settles them, and they turn out not to be a contradiction
at all — there are two distinct bars, each internally consistent:

1. **Customer app shell — 80px, 4 tabs.** `household_home` and `customer_profile_1` both
   carry `<div class="h-20 …">` with exactly four links: Services / Transit / Passbook /
   Union, 24px icons, 13px `label-ui` captions. No centre action button.
2. **Marketing shell — 64px, 5 tabs.** `landing` carries `<div class="h-16 …">` with
   Platform / How It Works / Pricing / About / Safety, 22px icons, 11px `label-caps`
   captions.
3. `hamali_labour_standard` and `goods_transport` use a third, 64px 5-tab booking-screen
   bar. Since the two shell-defining screens (home + profile) agree on 80px/4-tab, that is
   canonical for signed-in customers, and the booking screens follow the shell.

`BottomTabBar` now takes `size="default" | "compact"` for exactly these two.

### Correction to §2: the metric token was wrong

The 56–64px figure above was measured off screen renders and is **wrong**. The export's own
`fontSize` block gives `data-metric: 2.25rem` = **36px**. `--fy-text-metric` has been
corrected to 36px, and the whole type scale in `tailwind.config.ts` is now copied verbatim
from that block rather than eyeballed:

| token | design name | px / line-height / tracking / weight |
|---|---|---|
| display | display-hero-mobile, headline-lg | 44 / 44 / -0.02em / 400 |
| heading | headline-lg-mobile | 32 / 36 / -0.015em / 400 |
| title | headline-sm | 22 / 28 / -0.01em / 500 |
| metric | data-metric | 36 / 36 / -0.02em / 400 |
| body-lg | body-lg | 17 / 26 / -0.01em / 400 |
| body | body-default | 15 / 23 / 0 / 400 |
| label | label-ui | 13 / 18 / 0.01em / 500 |
| eyebrow | label-caps | 11 / 14 / 0.08em / 600 |

(There is also a 72px `display-hero` for desktop, unused so far.)

---

## 6. HARDCODED-HEX COUNT

Re-audited after Step 5 page 2. Count in `client/src/**` excluding `globals.css` (where raw
hex legitimately lives): **8**, all accounted for:

- **4** in `app/global-error.tsx` — the root error boundary renders its own `<html>`/`<body>`
  outside the app's stylesheet entirely, so no token exists to reference there.
- **2** `readToken()` fallbacks (`QRCodeDisplay`, `SignatureCanvas`) — canvas and QR
  generation cannot consume `var(--fy-…)`; they read the resolved value at runtime and the
  hex is only the last-resort default.
- **2** in comments/documentation strings, not rendered.

`RouteMap.tsx`'s Leaflet marker markup (3 occurrences of `#fff`) was converted to
`var(--fy-bone)` in this pass — those are DOM-rendered SVG, so CSS variables resolve.
