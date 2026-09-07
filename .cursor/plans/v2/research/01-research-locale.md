# Research — Locale / i18n (English + Marathi)

> Audience: planning + implementation agents. Reflects **codebase as of research date**.
> Scope: **English (`en`) + Marathi (`mr`)**. Hindi deferred.
> Implementation plan: [`../03-locale-marathi.md`](../03-locale-marathi.md)

---

## 1. Verdict

| Question | Answer |
|---|---|
| Existing i18n? | **None** — no `next-intl`, `react-i18next`, locale JSON, language switcher, or `middleware.ts` |
| Recommended library | **`next-intl`** (App Router–first; fits Next.js 16 + React 19 in `apps/web`) |
| Routing model | Cookie + Account toggle first (authenticated ops app). Optional `/[locale]` later if SEO needed |
| Fonts ready for Devanagari? | **No** — Geist (local) + Fraunces `subsets: ["latin"]` only |
| Money already locale-aware? | Partially — `formatInr` / `formatInrCompact` use `Intl` but **hardcoded `en-IN`** |
| Dates locale-aware? | **No** — `date-fns` `format(...)` without locale; calendar uses `"default"` |

**Stack confirmed:** Turborepo + pnpm, `apps/web` = Next.js 16.1.0 App Router, shadcn/Radix, Tailwind 4, sonner, zod + RHF, tRPC. Surfaces: Admin (`/admin/*`, `/gatepass`), Salesman (`/salesman/*`), Login (`/login`).

---

## 2. Current hooks (where i18n plugs in)

| Concern | File today | Gap |
|---|---|---|
| `html lang` | `apps/web/app/layout.tsx` → `lang="en"` | Must become dynamic from locale |
| Fonts | `layout.tsx` + `globals.css` (`--font-sans` / `--font-display`) | Need Devanagari face; Fraunces unsuitable for Marathi UI |
| Providers | `apps/web/providers/global.tsx` | Wrap `NextIntlClientProvider` (or equivalent) next to Theme/tRPC |
| Next config | `apps/web/next.config.js` = `{}` | Room for `next-intl` plugin |
| Middleware | **Missing** | Optional cookie locale detection |
| Persistence patterns | localStorage (`cart-provider`, `use-auth`), cookie (`ui/sidebar`), zustand (`login-store`) | Prefer **locale cookie** for SSR |
| Account pages | `app/admin/account/page.tsx`, `app/salesman/account/page.tsx` | Natural home for language switcher |
| Nav labels | `components/admin/nav-items.ts`, `components/salesman/nav-items.ts` | Hardcoded English arrays |
| Money | `apps/web/lib/format-money.ts` | Pass active locale into `Intl.NumberFormat` |
| Errors → UI | `lib/get-error-message.ts` + `TRPCError.message` | English server strings leak until error codes |

---

## 3. String inventory (where Marathi must appear)

Rough scale: ~107 non-`ui` TSX files under `apps/web`; ~25 files with `toast.success` / `toast.error`; ~19 files importing `date-fns`.

### P0 — must localize first (salesman daily path + chrome)

| Area | Surfaces | Verified paths |
|---|---|---|
| Bottom nav + titles | Admin 5 tabs · Salesman 4 tabs · page titles | `admin/nav-items.ts`, `salesman/nav-items.ts`, `admin-bottom-tabs.tsx`, `salesman-bottom-tabs.tsx`, `shared/nav-items.ts` |
| Auth | Password / OTP / magic link / errors | `components/auth/*` |
| Catalog · cart · checkout | Empty states · CTAs · order type · customer step | `app/salesman/*`, `cart-*`, `checkout-*`, `cart-empty-state.tsx` |
| Gate pass + handover | Allot · today/history · 3-step wizard · reason chips | `handover-dialog.tsx`, `gatepass/*`, `app/gatepass/page.tsx`, `app/salesman/gatepass/page.tsx` |
| Orders + status | Tabs Orders/Pre-orders · badges · sheets | `app/admin/orders/page.tsx`, `app/salesman/orders/page.tsx`, `order-list.tsx`, `*-status-badge.tsx` |

### P1 — admin density + polish

| Area | Surfaces | Verified paths |
|---|---|---|
| Admin CRUD | Forms · Zod messages · empty states | `components/admin/**`, `app/admin/**` |
| Dashboard | Greeting · KPI labels · quick actions | `app/admin/page.tsx`, `kpi-card.tsx` (`"vs yesterday"` hardcoded) |
| Toasts | Success + fallback error copy | Feature components + `get-error-message.ts` |
| Dates / money / calendar | INR · `date-fns` · DayPicker | `format-money.ts`, date-fns call sites, `ui/calendar.tsx` |

### P2 — later

| Area | Notes |
|---|---|
| API / tRPC errors | `packages/services/**`, `packages/trpc/**` — prefer stable **codes** → client message maps |
| Supabase auth emails / SMS | Outside repo (dashboard templates) |

### Skip

| Area | Reason |
|---|---|
| User-entered content | Product names, shop names, free-text notes — keep as entered |
| Brand wordmark | Keep `"Motake"` / `"Motake Admin"` in Latin |
| Hindi | Explicitly deferred |

---

## 4. Layout-shift risk map (EN → MR)

Cross-verified against live Tailwind / components.

### High

| UI pattern | EN example | MR example (illustrative) | Shift risk | Verified location |
|---|---|---|---|---|
| Admin bottom tabs | Dashboard · Products · … | डॅशबोर्ड · उत्पादने · … | `grid-cols-5` + `text-xs` wrap/clip | `admin-bottom-tabs.tsx` |
| Salesman bottom tabs | Products · Cart · Gate Pass · Orders | उत्पादने · कार्ट · गेट पास · ऑर्डर | `grid-cols-4` + `text-xs` | `salesman-bottom-tabs.tsx` |
| Status badges | Pending Verification | पडताळणी प्रलंबित | `Badge` = `whitespace-nowrap shrink-0` squeezes titles | `ui/badge.tsx`, `gatepass-status-badge.tsx` (`pending_verification`) |
| Order status badge | raw `confirmed` + `capitalize` | needs label map | Same nowrap badge pressure | `shared/order-status-badge.tsx`, `admin/orders/order-status-badge.tsx` |
| Handover step header | Confirm returns · Explain · Review | परतावा निश्चित करा · … | 3 labeled steps in one row overflow | `handover-dialog.tsx` `WIZARD_STEPS` + `StepHeader` |
| Primary CTAs | Send for Approval · Allot Gate Pass · Start shopping | मंजुरीसाठी पाठवा · … | `ui/button.tsx` `whitespace-nowrap`; sticky dual-button footers | `handover-dialog.tsx`, `app/gatepass/page.tsx`, `cart-empty-state.tsx` |
| Devanagari fonts | Geist / Fraunces latin | Noto Sans Devanagari / Mukta | Taller line-boxes, FOUT, inconsistent fallback | `app/layout.tsx`, `globals.css` |

### Medium

| UI pattern | EN example | Shift risk | Verified location |
|---|---|---|---|
| Handover reason chips | Damaged · Expired · Lost · Leaked · Other | Chip row wraps → dialog height jump | `handover-dialog.tsx` `SHORT_REASONS` |
| Orders tabs | Orders · Pre-orders / Pre-Orders | `TabsTrigger` `whitespace-nowrap` + `flex-1` clip | `app/admin/orders/page.tsx`, `app/salesman/orders/page.tsx`, `ui/tabs.tsx` |
| Gatepass table headers | Allocated · Sold · Remaining | `grid-cols-5` header/cell misalignment | `gatepass-today-view.desktop.tsx`, `gatepass-detail-drawer.tsx` |
| KPI cards | Sales value · Discrepancies · vs yesterday | `truncate` on label; uneven card heights | `kpi-card.tsx`, `app/admin/page.tsx` |
| List rows | badge + shop + amount | Horizontal CLS as badge width grows | `order-list.tsx`, salesman/admin list cards |

### Low

| UI pattern | Shift risk | Verified location |
|---|---|---|
| Dates | Longer month strings in meta rows | `date-fns` across ~19 files; formats like `"d MMM yyyy"` |
| Money | Digit shaping / grouping via `Intl` (keep INR) | `lib/format-money.ts` |
| Calendar month labels | Browser `"default"` locale drift | `ui/calendar.tsx` `toLocaleString("default", …)` |
| Icon-only controls | Translate `aria-label` only | size-8/9 icon buttons |
| Account / form fields with room | Minor reflow | Account pages, most full-width inputs |
| Toasts | Top overlay usually wraps safely | sonner via `providers/global.tsx` |

---

## 5. Recommended architecture

```
apps/web/locale/           # single working directory for i18n
  config.ts                # locales: ['en','mr'], defaultLocale: 'en'
  request.ts               # next-intl getRequestConfig → locale/messages/*
  translate.ts             # shared English → locale conversion
  messages/
    en.json                # keys = English UI sentences
    mr.json                # Marathi values for those English keys
  index.ts
apps/web/hooks/
  use-translate.ts         # tx("Send for Approval") → localized string
apps/web/components/shared/
  language-switcher.tsx    # EN | मराठी toggle
apps/web/middleware.ts     # optional: read/set NEXT_LOCALE cookie
```

**Shared API (mandatory):** Feature code calls only `tx("English…")` / `translate(locale, "English…")`. English sentence is the catalog key; Marathi lives in `locale/messages/mr.json`. Do not scatter per-screen translation maps or next-intl namespace keys in features.

**Do not translate:** shop/product/variety names, free-text notes, brand “Motake”.

**API errors (phase later):** emit stable codes from `packages/services`; map on client. Until then English `TRPCError.message` may still appear in toasts via `getErrorMessage`.

---

## 6. Standard approach (why next-intl)

| Option | Fit for Motake |
|---|---|
| **next-intl** | Best App Router story; RSC + client; message catalogs; optional routing |
| react-i18next | Works but more client-centric boilerplate for App Router |
| Manual context + JSON | Possible for tiny apps; weak for zod/dates/SSR |

**Persistence:** cookie preferred (SSR `html lang` + provider). Account switcher writes cookie and refreshes.

**Fonts:** load **Noto Sans Devanagari** (or Mukta) as primary/fallback for `mr`; keep Geist for Latin; do **not** use Fraunces for Marathi body/UI.

---

## 7. Suggested rollout order

1. next-intl + fonts + Account language switcher  
2. nav / chrome + auth  
3. salesman catalog / cart / checkout  
4. gatepass / handover (+ layout hardening)  
5. admin CRUD + dashboard  
6. date / money locale helpers  
7. API error codes (P2)

Low/medium UI string work can proceed after Phase 1 setup; high-risk spots need both translation **and** layout fixes before shipping Marathi as default for field users.

---

## 8. Out of scope (this research)

- Hindi catalog  
- Translating DB content  
- Full `/[locale]` URL strategy (optional later)  
- Supabase provider email templates (configure outside repo)

---

## 9. Cross-check log

| Claim | Evidence |
|---|---|
| No i18n package | `apps/web/package.json` dependencies — no next-intl / i18next |
| No middleware | `apps/web/middleware.ts` absent |
| Empty next config | `apps/web/next.config.js` exports `{}` |
| Latin-only Fraunces | `app/layout.tsx` `subsets: ["latin"]` |
| Badge nowrap | `components/ui/badge.tsx` |
| Button nowrap | `components/ui/button.tsx` |
| Admin 5-col tabs | `admin-bottom-tabs.tsx` `grid-cols-5` |
| Salesman 4-col tabs | `salesman-bottom-tabs.tsx` `grid-cols-4` |
| Handover steps / reasons | `handover-dialog.tsx` `WIZARD_STEPS`, `SHORT_REASONS` |
| Gatepass badge labels | `gatepass-status-badge.tsx` |
| Money locked en-IN | `lib/format-money.ts` |
| KPI “vs yesterday” | `kpi-card.tsx` L67 |
| Orders tabs | `app/admin/orders/page.tsx`, `app/salesman/orders/page.tsx` |
| Account pages exist | `app/admin/account/page.tsx`, `app/salesman/account/page.tsx` |
