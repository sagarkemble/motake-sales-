# Motake — Locale (English + Marathi) Implementation Plan

Mobile / admin ops app. Implements **English (`en`) + Marathi (`mr`)** via **next-intl**.
Hindi deferred. User-entered product/shop names stay untranslated.

**Research source:** [`research/01-research-locale.md`](./research/01-research-locale.md)  
**Rule:** Mark a row `done` = `true` only when that row’s acceptance criteria in **Definition of done** are met. All rows start `false`.

---

## Folder layout (locale working directory)

All i18n config + message catalogs live under **`apps/web/locale/`** (not top-level `i18n/` or `messages/`).

```
apps/web/locale/
  config.ts                 # locales, defaultLocale, cookie name
  request.ts                # next-intl getRequestConfig → loads locale/messages/*
  translate.ts              # shared English→locale API (server-safe helpers if needed)
  messages/
    en.json                 # English source strings (keys = English sentences)
    mr.json                 # Marathi values keyed by the same English strings
  index.ts                  # re-exports config + translate helpers
apps/web/hooks/
  use-translate.ts          # client hook: tx("Save changes") → localized string
apps/web/components/shared/
  language-switcher.tsx
```

Wire `next.config.js` / middleware to import from `./locale/...` (or `~/locale/...`).

---

## Shared translate API (mandatory)

**One** conversion path for UI copy. Call sites must **not** invent per-screen lookup logic, raw `useTranslations('nav')` key soup, or duplicate Marathi maps.

### Contract

| Piece | Role |
|---|---|
| **Input** | Normal **English** UI sentence (the string we ship today), e.g. `"Send for Approval"` |
| **Output** | Same meaning in the **user’s active locale** (`en` → unchanged English; `mr` → Marathi) |
| **Catalog** | `locale/messages/en.json` / `mr.json` use **English text as the message key** |
| **Missing key** | Return the English input unchanged (safe fallback); optionally `console.warn` in dev |

### Usage (target pattern)

```tsx
// Client components
const tx = useTranslate();
<button>{tx("Send for Approval")}</button>
toast.success(tx("Name updated"));

// With interpolation (keep one API)
tx("Hello, {name}", { name: firstName });
```

```ts
// Server / non-React (if needed)
import { translate } from "~/locale/translate";
translate(locale, "Allot Gate Pass");
```

### Implementation notes

- Internally may wrap next-intl (`useTranslations` / `getTranslations`) **once** inside `useTranslate` / `translate`.
- Feature code only imports **`useTranslate`** or **`translate`** — never scatters namespace-specific `t('gatepass.sendForApproval')` keys unless hidden inside the shared helper.
- Zod / toast / nav / badges all go through this same helper so conversion burden stays in **`locale/translate.ts` + `hooks/use-translate.ts`**.
- Do **not** pass UGC (shop names, product names) through `tx` — only fixed UI English.

---

## Scope

| In scope | Out of scope (now) |
|---|---|
| `apps/web/locale/**` wiring, catalogs, language switcher | Hindi |
| Shared `tx` / `translate` English→locale API | Translating DB content |
| Low + medium layout-risk string surfaces | Supabase email/SMS templates |
| High layout-risk surfaces + hardening | Full `/[locale]` SEO routing (optional later) |
| Locale-aware money/dates helpers | Stable API error-code system (P2 follow-up) |
| Devanagari font loading | Per-file custom translation maps |

---

## Phase 1 — Foundation (packages, config, shared `tx`, switcher, fonts)

Install and wire i18n so any screen can call **`tx("English…")`** and users can switch `en` ↔ `mr` from Account. No feature-string migration required to close Phase 1 except smoke strings proving the pipeline.

| # | Step | Detail | Where it exists / goes | Done |
|---|---|---|---|---|
| 1.1 | Install `next-intl` in web app | Add dependency with pnpm workspace filter for `apps/web` | `apps/web/package.json` (today: no i18n libs) | true |
| 1.2 | Create locale config | `locales: ['en','mr']`, `defaultLocale: 'en'`, locale cookie name (e.g. `NEXT_LOCALE`) | New: `apps/web/locale/config.ts` | true |
| 1.3 | Create server request config | `getRequestConfig` loads `locale/messages/{locale}.json` | New: `apps/web/locale/request.ts` | true |
| 1.4 | Add message catalogs (English-as-key) | Flat or lightly nested JSON where **keys are English UI strings** and `mr.json` values are Marathi; seed Account/smoke strings | New: `apps/web/locale/messages/en.json`, `apps/web/locale/messages/mr.json` | true |
| 1.5 | Implement shared `translate` | Server/util: `(locale, english, values?) => localized`; lookup by English key; fallback to English | New: `apps/web/locale/translate.ts` (+ `locale/index.ts` re-exports) | true |
| 1.6 | Implement `useTranslate` | Client hook returning `tx(english, values?)` that reads active locale and delegates to the same catalog rules | New: `apps/web/hooks/use-translate.ts` | true |
| 1.7 | Wire Next plugin / next config | Point next-intl plugin / request config at `./locale/request.ts` | `apps/web/next.config.js` (today `{}`) | true |
| 1.8 | Add locale middleware (cookie) | Read/set locale cookie; default `en`; no forced `/[locale]` prefix unless chosen later | New: `apps/web/middleware.ts` (today: **missing**) | true |
| 1.9 | Dynamic `html lang` | Set `<html lang={locale}>` from resolved locale | `apps/web/app/layout.tsx` (today `lang="en"`) | true |
| 1.10 | Wrap providers | Provide messages to client tree so `useTranslate` works app-wide | `apps/web/providers/global.tsx` | true |
| 1.11 | Load Devanagari font | Add Noto Sans Devanagari (or Mukta) via `next/font/google`; expose CSS variable; stack under `--font-sans` for `mr` (keep Geist for Latin; avoid Fraunces for Marathi UI) | `apps/web/app/layout.tsx`, `apps/web/app/globals.css` | true |
| 1.12 | Build `LanguageSwitcher` | Shared control: English \| मराठी; writes cookie; refreshes so SSR + client agree | New: `apps/web/components/shared/language-switcher.tsx` | true |
| 1.13 | Mount switcher on Admin Account | Settings-style row under profile details | `apps/web/app/admin/account/page.tsx` | true |
| 1.14 | Mount switcher on Salesman Account | Same UX as admin | `apps/web/app/salesman/account/page.tsx` | true |
| 1.15 | Smoke-test `tx` pipeline | Account label uses `tx("Language")` (and MR catalog entry); switching persists after reload | Account pages + `locale/messages/*` | true |
| 1.16 | Document locale convention | English-as-key rule, use only `tx`/`translate`, do-not-translate list (Motake brand, shop/product names), how to add `mr` entries | Comment in `locale/translate.ts` or `locale/config.ts` | true |

---

## Phase 2 — Low + medium risk surfaces

Replace hardcoded English UI with **`tx("…")`** (same English string as today). Add the Marathi value once in `locale/messages/mr.json`. Prefer this over one-off maps.

### 2A — Low risk

| # | Step | Detail | Where it exists | Done |
|---|---|---|---|---|
| 2.1 | Locale-aware money helpers | Pass active locale into `Intl.NumberFormat` (keep `currency: "INR"`); default fallback `en-IN` | `apps/web/lib/format-money.ts` | true |
| 2.2 | Shared date format helper | Wrap `date-fns` `format` with `enUS` / `mr` locale modules; migrate call sites gradually | New helper under `apps/web/lib/`; ~19 `date-fns` consumers | true |
| 2.3 | Calendar locale | Drive month labels from app locale instead of `"default"` | `apps/web/components/ui/calendar.tsx` | true |
| 2.4 | Auth screen copy | Wrap titles, labels, placeholders, validation, toasts with `tx("…")` | `apps/web/components/auth/*` | true |
| 2.5 | Account page chrome | `tx` for profile labels, Save, Name updated, Install app, dialogs | `app/admin/account/page.tsx`, `app/salesman/account/page.tsx`, `components/account/*` | true |
| 2.6 | Simple empty states (roomy) | `tx` for empty-state copy (long CTA overflow → Phase 3) | `cart-empty-state.tsx`; admin empty lists | true |
| 2.7 | Toast success strings | `toast.success(tx("…"))` — no separate toast i18n path | Toast call sites (~25 files) | true |
| 2.8 | Icon-only `aria-label`s | `aria-label={tx("…")}` | Icon buttons in headers/drawers | true |
| 2.9 | Validation messages | Zod messages via `tx("Enter a shop name")` (or factory that calls `translate`) | `customer-form.tsx`, `product-form.tsx`, `salesman-form.tsx`, `password-login-form.tsx` | true |

### 2B — Medium risk

| # | Step | Detail | Where it exists | Layout note | Done |
|---|---|---|---|---|---|
| 2.10 | Handover reason chips | `label: tx("Damaged")` etc.; allow `flex-wrap` | `handover-dialog.tsx` `SHORT_REASONS` | Dialog height may grow | true |
| 2.11 | Orders tabs (admin) | `tx("Pre-Orders")` / `tx("Orders")`; `min-w-0` if needed | `app/admin/orders/page.tsx` + `ui/tabs.tsx` | Equal `flex-1` tabs | true |
| 2.12 | Orders tabs (salesman) | `tx("Orders")` / `tx("Pre-orders")` | `app/salesman/orders/page.tsx` | Same | true |
| 2.13 | Gatepass Today/History tabs | `tx` tab labels | `app/salesman/gatepass/page.tsx` | `flex-1` triggers | true |
| 2.14 | Salesman detail tabs | `tx("Sales")` / `tx("Gate Pass")` / `tx("Verification")` | `app/admin/salesman/[id]/page.tsx` | nowrap tabs | true |
| 2.15 | Gatepass table headers | `tx("Item")` / `tx("Allocated")` / …; short MR values | `gatepass-today-view.desktop.tsx`, `gatepass-detail-drawer.tsx` | `grid-cols-5` align | true |
| 2.16 | KPI card chrome | `tx` for KPI labels + `tx("vs yesterday")` / `tx("New")` | `kpi-card.tsx`, `app/admin/page.tsx`, `sales-tab.tsx` | truncate / 2-line clamp | true |
| 2.17 | Quick actions labels | Resolve labels through `tx` when rendering (keep English in source arrays if desired) | `admin/nav-items.ts`, `salesman/nav-items.ts` quick actions | Chip/row width | true |
| 2.18 | List-row chrome (non-badge) | `tx` for static meta (“from …”, order type labels) | `order-list.tsx`, `product-catalog-card.tsx`, checkout steps | `min-w-0` + truncate | true |
| 2.19 | Gatepass info banner | `tx` helper copy | `gatepass-info-banner.tsx`, related drawer copy | Soft wrap OK | true |
| 2.20 | Checkout low/med copy | `tx` on order type / customer / success step strings | `checkout/order-type-step.tsx`, `customer-details-step.tsx`, `order-success-step.tsx` | Sticky CTA → Phase 3 if needed | true |

---

## Phase 3 — High risk surfaces

Use the same **`tx("English")`** API **and** harden layout. Do not mark done on translation alone if overflow/clip remains at 360–428px in `mr`.

| # | Step | Detail | Where it exists | Hardening required | Done |
|---|---|---|---|---|---|
| 3.1 | Admin bottom nav labels | Render `tx(navItem.label)` (labels stay English in `nav-items.ts`) | `admin/nav-items.ts` → `admin-bottom-tabs.tsx` (`grid-cols-5`) | 2-line labels / shorter MR; 360px QA | false |
| 3.2 | Salesman bottom nav labels | Same pattern | `salesman/nav-items.ts` → `salesman-bottom-tabs.tsx` (`grid-cols-4`) | Preserve cart badge | false |
| 3.3 | Page title helper | Titles resolved via `tx` / `translate` | `shared/nav-items.ts` + wrappers | Header truncate OK if intentional | false |
| 3.4 | Gatepass status badges | Map status → English label → `tx("Pending Verification")` etc. | `gatepass-status-badge.tsx` + `ui/badge.tsx` | Short MR; max-w / ellipsis | false |
| 3.5 | Order status badges | English label map then `tx`; stop raw `capitalize` status | `shared/order-status-badge.tsx`, `admin/orders/order-status-badge.tsx` | Same badge pressure | false |
| 3.6 | Product/active status badges | `tx` for status strings | `admin/products/status-badge.tsx` | nowrap badge | false |
| 3.7 | Handover wizard step header | `tx` on step labels; redesign `StepHeader` for length | `handover-dialog.tsx` `WIZARD_STEPS` | Number + title below / scrollable | false |
| 3.8 | Handover primary CTA | `tx("Send for Approval")` | `handover-dialog.tsx` | Full-width / wrap / shorter MR | false |
| 3.9 | Allot Gate Pass CTA + chrome | `tx("Allot Gate Pass")` / `tx("Allotting")` | `app/gatepass/page.tsx` | Sticky footer overflow | false |
| 3.10 | Long salesman CTAs | `tx("Start shopping")` + other long CTAs | `cart-empty-state.tsx`, checkout footers | Stack dual buttons | false |
| 3.11 | List rows: badge + title + amount | After 3.4–3.5, verify no CLS | `order-list.tsx`, list cards | `min-w-0`; optional badge min-width | false |
| 3.12 | Font metrics pass under `mr` | Devanagari leading; no Fraunces on MR UI | `layout.tsx`, `globals.css` | Fix clipped line-boxes | false |
| 3.13 | Handover + gatepass E2E in `mr` | Full flows without overflow | handover + gatepass pages | QA at 360px & 428px | false |
| 3.14 | Bottom nav E2E in `mr` | All tabs readable/tappable | `*-bottom-tabs.tsx` | QA until pass | false |

---

## Suggested execution order

```
Phase 1 (locale/ folder + translate/tx + switcher + fonts)
  → Phase 2A (money/dates/auth/account/toasts via tx)
  → Phase 2B (tabs/chips/KPI/headers via tx)
  → Phase 3 (nav/badges/handover/CTAs via tx + layout QA)
```

Do not ship Marathi as the default field-user locale until **Phase 3** rows for bottom nav, badges, and handover are `true`.

---

## Definition of done

### Global (every phase)

1. **Toggle works:** From Admin and Salesman Account, user can switch `en` ↔ `mr`; choice persists after full reload (cookie).
2. **`html lang` matches:** Document language attribute equals active locale.
3. **Single translate API:** UI copy uses **`tx` / `translate` with English input** only; no parallel per-feature translation helpers or scattered next-intl namespace keys in feature components.
4. **Catalog location:** Config + messages live under **`apps/web/locale/`** (including `locale/messages/`).
5. **No regressions in `en`:** English copy and layout match pre-i18n behavior (`tx` returns the input English when locale is `en`).
6. **No translated UGC:** Product names, shop names, and free-text notes are never passed through `tx`.
7. **Brand stays Latin:** “Motake” / “Motake Admin” wordmarks unchanged.
8. **Types / lint:** `apps/web` `check-types` and lint pass for touched files.
9. **Done column:** Set a row’s `Done` to `true` only when that row’s specific criteria below are met; otherwise leave `false`.

### Phase 1 complete when

- [x] `next-intl` installed; **`apps/web/locale/`** holds config, request, messages, and `translate`.
- [x] `useTranslate` → `tx("…")` works on client; `translate(locale, "…")` available for non-React.
- [x] Devanagari-capable font loads for `mr`.
- [x] `LanguageSwitcher` mounted on both Account pages.
- [x] Smoke: `tx("Language")` (or equivalent) switches EN/MR and persists.
- [x] Rows **1.1–1.16** are `true`.

### Phase 2 complete when

- [x] Money and dates use locale-aware formatters (INR retained).
- [x] Listed low/medium surfaces call **`tx("English…")`** and have `mr.json` entries.
- [x] At 360px in `mr`, medium-risk spots may wrap but must **not** horizontally overflow.
- [x] Rows **2.1–2.20** are `true`.

### Phase 3 complete when

- [ ] Bottom nav, badges, handover stepper/CTAs, allot/start-shopping CTAs use **`tx`** and pass layout QA at 360px & 428px.
- [ ] Marathi UI does not use Fraunces for body/nav/badge text.
- [ ] Manual QA salesman + admin flows in `mr` (see prior checklist).
- [ ] Rows **3.1–3.14** are `true`.

### Explicitly not required for this plan’s DoD

- Hindi messages.
- Translating Supabase magic-link / OTP provider emails.
- Replacing all `TRPCError.message` English strings with error codes (P2 follow-up).
- URL-prefixed `/en/...` `/mr/...` routing.

---

## Tracking tip

When finishing a row: flip `| false |` → `| true |` in this file in the same PR as the code change, so the plan stays the single source of progress.
