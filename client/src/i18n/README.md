# i18n (next-intl)

FYRO ships English / Telugu (తెలుగు) / Hindi (हिंदी) via [`next-intl`](https://next-intl.dev).
This is **cookie-based, no URL routing** — there is no `/en/...` or `[locale]`
segment, so every existing route (`/customer/dashboard`, `/login`, etc.)
keeps its URL unchanged. Locale is stored in the `NEXT_LOCALE` cookie and
read server-side per request.

## How it works

1. `src/i18n/request.ts` — `getRequestConfig()` reads the `NEXT_LOCALE`
   cookie on every request, falls back to `en` if it's missing/invalid, and
   loads the matching JSON file from `src/i18n/messages/`.
2. `next.config.js` wraps the Next config with `createNextIntlPlugin('./src/i18n/request.ts')`.
3. `src/app/layout.tsx` (Server Component) calls `getLocale()` / `getMessages()`
   and wraps `children` in `<NextIntlClientProvider locale={locale} messages={messages}>`,
   alongside (not replacing) the existing `AuthProvider`.
4. Any Server Component can call `getTranslations('namespace')` from
   `next-intl/server`; any Client Component can call `useTranslations('namespace')`
   from `next-intl` — both read from the same provider/request config.
5. To change the active locale: call the `setLocaleAction` Server Action
   (`src/i18n/setLocale.ts`), which sets the `NEXT_LOCALE` cookie, then call
   `router.refresh()` on the client so Server Components re-render with the
   new locale. See `LanguagePill` usage in `src/app/(marketing)/page.tsx` for
   the full working example.

## How to add a new translatable string

1. Add the key to `src/i18n/messages/en.json` first — English is the
   structural source of truth. Nest it under the namespace matching the
   page/component (e.g. `marketing.faq.items.newQuestion`, `auth.login.foo`).
2. Add the **same key path** with a real Telugu translation to `te.json`,
   and a real Hindi translation to `hi.json`. Do not leave English text in
   `te.json`/`hi.json` as a placeholder — every key in `en.json` must exist
   with an actual translated value in the other two files (a mismatch will
   silently fall back to showing the key path at runtime, or throw in dev).
3. Consume it:
   - Server Component: `const t = await getTranslations('namespace'); t('key')`
   - Client Component (`'use client'`): `const t = useTranslations('namespace'); t('key')`
4. Sanity-check structural parity across the three files before committing —
   a one-liner:
   ```js
   node -e "
   const en=require('./src/i18n/messages/en.json'), te=require('./src/i18n/messages/te.json'), hi=require('./src/i18n/messages/hi.json');
   const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&!Array.isArray(v)?keys(v,p+k+'.'):[p+k]);
   const [ek,tk,hk]=[keys(en),keys(te),keys(hi)].map(a=>a.sort());
   console.log('en',ek.length,'te',tk.length,'hi',hk.length);
   console.log('missing in te:', ek.filter(k=>!tk.includes(k)));
   console.log('missing in hi:', ek.filter(k=>!hk.includes(k)));
   "
   ```

## What's converted (proof-of-pipeline examples)

- `src/components/ui/BottomTabNav.tsx` — nav tab labels, via the `nav`
  namespace. (The five layouts that render it — customer/driver/hamali/
  mutha/mutha-member — still pass hardcoded English `label` strings as
  props; BottomTabNav maps the known English strings to translation keys
  internally so it degrades safely if an unmapped label is ever passed.)
- `src/app/(marketing)/page.tsx` (home page) — fully converted to
  `useTranslations('marketing.home')`, including the working `LanguagePill`
  language switcher (`marketing.home` + `nav` + `languageSwitcher` namespaces
  demonstrate the full cookie → refresh → re-render loop).

## What's NOT converted yet (todo for the next pass)

Translated strings already exist in `en.json` / `te.json` / `hi.json` for
all of the pages below (see the `marketing.*` and `auth.*` namespaces) —
they just aren't wired into the components yet:

- `src/app/(marketing)/layout.tsx` — the floating header/footer nav
  (`How it works` / `Pricing` / `Safety` / `FAQ` / `About` / `Contact` /
  `Log in` / `Book a delivery` links, mobile menu, footer copyright).
  Messages ready under `marketing.layout`.
- `src/app/(marketing)/about/page.tsx` — messages ready under `marketing.about`.
- `src/app/(marketing)/contact/page.tsx` — messages ready under `marketing.contact`.
- `src/app/(marketing)/faq/page.tsx` — messages ready under `marketing.faq`.
- `src/app/(marketing)/how-it-works/page.tsx` — messages ready under `marketing.howItWorks`.
- `src/app/(marketing)/pricing/page.tsx` — messages ready under `marketing.pricing`.
- `src/app/(marketing)/safety/page.tsx` — messages ready under `marketing.safety`.
- `src/app/login/page.tsx` — messages ready under `auth.login`.
- `src/app/signup/customer/page.tsx` — messages ready under `auth.signupCustomer`.
- `src/app/signup/driver/page.tsx` — messages ready under `auth.signupDriver`.
- `src/app/signup/hamali/page.tsx` — messages ready under `auth.signupHamali`.
- `src/components/worker/OnlineToggle.tsx` — messages ready under `worker.onlineToggle`.
- `src/components/worker/StatusPill.tsx` (and `STATUS_LABEL` in `src/lib/types.ts`,
  which it currently sources labels from) — messages ready under `worker.statusPill`.
- The five `BottomTabNav`-consuming layouts (`customer/driver/hamali/mutha/
  mutha-member` `layout.tsx`) still build `TabItem[]` with hardcoded English
  `label` strings rather than calling `useTranslations('nav')` directly —
  BottomTabNav's label-mapping fallback (see above) covers this for now,
  but the layouts themselves should switch to `t('home')` etc. directly
  next, and the fallback map removed once they do.
- Everything under `src/app/admin/**`, `src/app/customer/**` (dashboard/book/
  history/profile/support/track), `src/app/driver/**`, `src/app/hamali/**`,
  `src/app/mutha/**`, `src/app/mutha-member/**`, and `src/app/styleguide/**`
  — none of these have translation keys yet at all (out of scope for this
  pass; the task was limited to marketing pages, login/signup, nav, and the
  two worker components listed in `TASK`).

When converting one of the pages above, follow the pattern in
`src/app/(marketing)/page.tsx`: import `useTranslations` (or, for a Server
Component, `getTranslations` from `next-intl/server`), scope it to the
matching namespace, and replace the hardcoded string literal with a `t(...)`
call — the message keys are already there waiting.
